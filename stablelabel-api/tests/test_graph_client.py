"""Comprehensive unit tests for GraphClient.

Covers GET/POST verbs, pagination, polling, rate limiting, retry logic,
error extraction, 423 Locked handling, token refresh delegation, and
proactive backoff from RateLimit-Remaining headers.

Does NOT duplicate 401 retry tests — those live in test_graph_auth_retry.py.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.exceptions import (
    GraphLockedError,
    GraphThrottledError,
    StableLabelError,
)
from app.services.graph_client import GraphClient, GRAPH_BASE


# ── Helpers ──────────────────────────────────────────────────────────


def _mock_token_manager() -> MagicMock:
    tm = MagicMock()
    tm.acquire_token = MagicMock(return_value="tok-123")
    return tm


def _mock_limiter() -> MagicMock:
    limiter = MagicMock()
    limiter.acquire = AsyncMock()
    limiter.apply_server_hint = MagicMock()
    return limiter


def _client_with_mocks(
    responses: list[httpx.Response] | httpx.Response | None = None,
    side_effect=None,
) -> tuple[GraphClient, MagicMock, MagicMock]:
    """Return (client, mock_http, mock_limiter) with plumbing wired up."""
    tm = _mock_token_manager()
    client = GraphClient(tm)

    limiter = _mock_limiter()
    client._rate_limiters = MagicMock()
    client._rate_limiters.get = MagicMock(return_value=limiter)

    mock_http = AsyncMock()
    if side_effect is not None:
        mock_http.request = AsyncMock(side_effect=side_effect)
    elif isinstance(responses, list):
        mock_http.request = AsyncMock(side_effect=responses)
    elif responses is not None:
        mock_http.request = AsyncMock(return_value=responses)
    client._http = mock_http

    return client, mock_http, limiter


def _resp(
    status: int,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
    method: str = "GET",
    url: str = f"{GRAPH_BASE}/test",
) -> httpx.Response:
    kwargs: dict = {
        "status_code": status,
        "request": httpx.Request(method, url),
    }
    if headers:
        kwargs["headers"] = headers
    if body is not None:
        kwargs["json"] = body
    else:
        kwargs["content"] = b""
    return httpx.Response(**kwargs)


# ── 1. GET requests ─────────────────────────────────────────────────


class TestGet:
    @pytest.mark.asyncio
    async def test_get_success_returns_body(self) -> None:
        client, mock_http, _ = _client_with_mocks(
            _resp(200, {"value": [{"id": "1"}]})
        )
        result = await client.get("t1", "/sites")
        assert result == {"value": [{"id": "1"}]}

    @pytest.mark.asyncio
    async def test_get_passes_query_params(self) -> None:
        client, mock_http, _ = _client_with_mocks(
            _resp(200, {"value": []})
        )
        await client.get("t1", "/sites", top=10, filter="name eq 'x'")
        _call = mock_http.request.call_args
        assert _call.kwargs["params"] == {"top": 10, "filter": "name eq 'x'"}

    @pytest.mark.asyncio
    async def test_get_non_retryable_error_raises(self) -> None:
        client, _, _ = _client_with_mocks(
            _resp(403, {"error": {"code": "accessDenied", "message": "Forbidden"}})
        )
        with pytest.raises(StableLabelError, match="403"):
            await client.get("t1", "/sites")

    @pytest.mark.asyncio
    async def test_get_empty_body_returns_empty_dict(self) -> None:
        client, _, _ = _client_with_mocks(_resp(204))
        result = await client.get("t1", "/sites")
        assert result == {}


# ── 2. POST requests ────────────────────────────────────────────────


class TestPost:
    @pytest.mark.asyncio
    async def test_post_returns_body_status_headers(self) -> None:
        client, _, _ = _client_with_mocks(
            _resp(200, {"id": "op-1"}, headers={"x-custom": "val"})
        )
        body, status, hdrs = await client.post("t1", "/items", json={"name": "f"})
        assert body == {"id": "op-1"}
        assert status == 200
        assert hdrs["x-custom"] == "val"

    @pytest.mark.asyncio
    async def test_post_202_accepted(self) -> None:
        client, _, _ = _client_with_mocks(
            _resp(
                202,
                {},
                headers={"location": "https://graph.microsoft.com/v1.0/operations/123"},
            )
        )
        body, status, hdrs = await client.post("t1", "/drive/items/id/label")
        assert status == 202
        assert "location" in hdrs

    @pytest.mark.asyncio
    async def test_post_sends_json_payload(self) -> None:
        payload = {"sensitivityLabelId": "abc"}
        client, mock_http, _ = _client_with_mocks(_resp(200, {}))
        await client.post("t1", "/items", json=payload)
        call_kwargs = mock_http.request.call_args.kwargs
        assert call_kwargs["json"] == payload


# ── 3. get_all_pages ────────────────────────────────────────────────


class TestGetAllPages:
    @pytest.mark.asyncio
    async def test_follows_nextlink(self) -> None:
        page1 = _resp(200, {
            "value": [{"id": "1"}],
            "@odata.nextLink": f"{GRAPH_BASE}/sites?$skip=1",
        })
        page2 = _resp(200, {"value": [{"id": "2"}]})
        client, _, _ = _client_with_mocks([page1, page2])

        items = await client.get_all_pages("t1", "/sites")
        assert items == [{"id": "1"}, {"id": "2"}]

    @pytest.mark.asyncio
    async def test_empty_results(self) -> None:
        client, _, _ = _client_with_mocks(_resp(200, {"value": []}))
        items = await client.get_all_pages("t1", "/sites")
        assert items == []

    @pytest.mark.asyncio
    async def test_single_page_no_nextlink(self) -> None:
        client, _, _ = _client_with_mocks(
            _resp(200, {"value": [{"id": "a"}, {"id": "b"}]})
        )
        items = await client.get_all_pages("t1", "/items")
        assert len(items) == 2

    @pytest.mark.asyncio
    async def test_multiple_pages(self) -> None:
        pages = [
            _resp(200, {
                "value": [{"id": "1"}],
                "@odata.nextLink": f"{GRAPH_BASE}/items?$skip=1",
            }),
            _resp(200, {
                "value": [{"id": "2"}],
                "@odata.nextLink": f"{GRAPH_BASE}/items?$skip=2",
            }),
            _resp(200, {"value": [{"id": "3"}]}),
        ]
        client, _, _ = _client_with_mocks(pages)
        items = await client.get_all_pages("t1", "/items")
        assert [i["id"] for i in items] == ["1", "2", "3"]


# ── 4. poll_operation ────────────────────────────────────────────────


class TestPollOperation:
    @pytest.mark.asyncio
    async def test_poll_completes(self) -> None:
        tm = _mock_token_manager()
        client = GraphClient(tm)

        running = httpx.Response(200, json={"status": "inProgress"},
                                 request=httpx.Request("GET", "https://dummy.microsoft.com/op"))
        done = httpx.Response(200, json={"status": "completed", "resourceId": "x"},
                              request=httpx.Request("GET", "https://dummy.microsoft.com/op"))

        mock_http = AsyncMock()
        mock_http.get = AsyncMock(side_effect=[running, done])
        client._http = mock_http

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            result = await client.poll_operation(
                "https://dummy.microsoft.com/op", poll_interval=0.01
            )

        assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_poll_timeout(self) -> None:
        tm = _mock_token_manager()
        client = GraphClient(tm)

        still_running = httpx.Response(200, json={"status": "inProgress"},
                                       request=httpx.Request("GET", "https://foo.microsoft.com/op"))
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(return_value=still_running)
        client._http = mock_http

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            result = await client.poll_operation(
                "https://foo.microsoft.com/op",
                poll_interval=1.0,
                timeout=3.0,
            )

        assert result["status"] == "timeout"
        assert result["elapsed"] == 3.0

    @pytest.mark.asyncio
    async def test_poll_failed_status(self) -> None:
        tm = _mock_token_manager()
        client = GraphClient(tm)

        failed = httpx.Response(200, json={"status": "failed", "error": "bad"},
                                request=httpx.Request("GET", "https://ops.microsoft.com/x"))
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(return_value=failed)
        client._http = mock_http

        result = await client.poll_operation("https://ops.microsoft.com/x")
        assert result["status"] == "failed"

    @pytest.mark.asyncio
    async def test_poll_rejects_non_microsoft_url(self) -> None:
        tm = _mock_token_manager()
        client = GraphClient(tm)
        with pytest.raises(StableLabelError, match="Refusing to poll"):
            await client.poll_operation("https://evil.com/op")

    @pytest.mark.asyncio
    async def test_poll_respects_interval(self) -> None:
        tm = _mock_token_manager()
        client = GraphClient(tm)

        responses = [
            httpx.Response(200, json={"status": "inProgress"},
                           request=httpx.Request("GET", "https://g.microsoft.com/op")),
            httpx.Response(200, json={"status": "completed"},
                           request=httpx.Request("GET", "https://g.microsoft.com/op")),
        ]
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(side_effect=responses)
        client._http = mock_http

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await client.poll_operation(
                "https://g.microsoft.com/op", poll_interval=7.5
            )
            mock_sleep.assert_awaited_once_with(7.5)


# ── 5. Rate limiting integration ────────────────────────────────────


class TestRateLimitCost:
    @pytest.mark.asyncio
    async def test_get_costs_1_ru(self) -> None:
        client, _, limiter = _client_with_mocks(_resp(200, {}))
        await client.get("t1", "/items")
        limiter.acquire.assert_awaited_once_with(1.0)

    @pytest.mark.asyncio
    async def test_post_costs_2_ru(self) -> None:
        client, _, limiter = _client_with_mocks(_resp(200, {}))
        await client.post("t1", "/items", json={})
        limiter.acquire.assert_awaited_once_with(2.0)


# ── 6. Retry logic ──────────────────────────────────────────────────


class TestRetryLogic:
    @pytest.mark.asyncio
    async def test_429_with_retry_after(self) -> None:
        throttled = _resp(429, {"error": {"message": "throttled"}},
                          headers={"Retry-After": "2"})
        ok = _resp(200, {"ok": True})
        client, mock_http, _ = _client_with_mocks([throttled, ok])

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            result = await client.get("t1", "/items")

        assert result == {"ok": True}
        # Should have slept for the Retry-After value
        mock_sleep.assert_awaited_once_with(2.0)

    @pytest.mark.asyncio
    async def test_5xx_exponential_backoff(self) -> None:
        err500 = _resp(500, {"error": {"message": "server error"}})
        ok = _resp(200, {"ok": True})
        client, _, _ = _client_with_mocks([err500, ok])

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with patch("app.services.graph_client.random.uniform", return_value=0.25):
                result = await client.get("t1", "/items")

        assert result == {"ok": True}
        # _backoff(0): base = 2^0 = 1, jitter = 0.25 → sleep(1.25)
        mock_sleep.assert_awaited_once_with(1.25)

    @pytest.mark.asyncio
    async def test_408_retryable(self) -> None:
        err408 = _resp(408, {"error": {"message": "timeout"}})
        ok = _resp(200, {"val": 1})
        client, _, _ = _client_with_mocks([err408, ok])

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            result = await client.get("t1", "/items")
        assert result == {"val": 1}

    @pytest.mark.asyncio
    async def test_max_3_retries_then_raises(self) -> None:
        err502 = _resp(502, {"error": {"message": "bad gateway"}})
        # 4 responses = 1 initial + 3 retries
        client, mock_http, _ = _client_with_mocks([err502, err502, err502, err502])

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(StableLabelError, match="502"):
                await client.get("t1", "/items")

        assert mock_http.request.call_count == 4

    @pytest.mark.asyncio
    async def test_transport_error_retries(self) -> None:
        ok = _resp(200, {"ok": True})
        client, _, _ = _client_with_mocks(
            side_effect=[httpx.ConnectError("conn refused"), ok]
        )

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            result = await client.get("t1", "/items")
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_transport_error_exhausts_retries(self) -> None:
        exc = httpx.ReadTimeout("timed out")
        client, _, _ = _client_with_mocks(
            side_effect=[exc, exc, exc, exc]
        )

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(StableLabelError, match="Transport error after 3 retries"):
                await client.get("t1", "/items")

    @pytest.mark.asyncio
    async def test_backoff_jitter_increases_with_attempt(self) -> None:
        """Verify that higher attempt numbers produce larger base backoff."""
        with patch("app.services.graph_client.random.uniform", return_value=0) as mock_rand:
            with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                await GraphClient._backoff(0)
                mock_sleep.assert_awaited_with(1)  # 2^0 = 1, jitter=0

                await GraphClient._backoff(2)
                mock_sleep.assert_awaited_with(4)  # 2^2 = 4, jitter=0

                # Check that jitter range scales with base
                assert mock_rand.call_args_list[0].args == (0, 0.5)   # base=1, 1*0.5
                assert mock_rand.call_args_list[1].args == (0, 2.0)   # base=4, 4*0.5


# ── 7. Error extraction ─────────────────────────────────────────────


class TestExtractError:
    def test_structured_graph_error(self) -> None:
        resp = _resp(400, {
            "error": {
                "code": "invalidRequest",
                "message": "The label ID is not valid.",
                "innerError": {"code": "badArgument"},
            },
        })
        msg = GraphClient._extract_error(resp)
        assert "invalidRequest" in msg
        assert "badArgument" in msg
        assert "The label ID is not valid." in msg

    def test_error_without_inner(self) -> None:
        resp = _resp(400, {"error": {"code": "badRequest", "message": "oops"}})
        msg = GraphClient._extract_error(resp)
        assert "badRequest" in msg
        assert "oops" in msg

    def test_non_json_response(self) -> None:
        resp = httpx.Response(
            500,
            text="Internal Server Error",
            request=httpx.Request("GET", "https://graph.microsoft.com/v1.0/x"),
        )
        msg = GraphClient._extract_error(resp)
        assert "Internal Server Error" in msg

    def test_empty_error_fields_falls_back_to_text(self) -> None:
        resp = _resp(400, {"error": {}})
        msg = GraphClient._extract_error(resp)
        # Should fall back to resp.text since all parts are empty
        assert isinstance(msg, str)

    def test_error_raised_by_non_retryable_includes_message(self) -> None:
        """The StableLabelError raised for non-retryable codes should contain the extracted error."""
        resp = _resp(
            403,
            {"error": {"code": "accessDenied", "message": "No permission"}},
        )
        client, _, _ = _client_with_mocks(resp)

        with pytest.raises(StableLabelError, match="accessDenied"):
            # Run synchronously via asyncio
            asyncio.get_event_loop().run_until_complete(client.get("t1", "/x"))


# ── 8. 423 Locked → GraphLockedError ────────────────────────────────


class TestLockedError:
    @pytest.mark.asyncio
    async def test_423_raises_graph_locked_error(self) -> None:
        resp = _resp(423, {"error": {"code": "itemLocked", "message": "File is checked out"}})
        client, _, _ = _client_with_mocks(resp)

        with pytest.raises(GraphLockedError, match="locked.*423"):
            await client.get("t1", "/drive/items/abc")

    @pytest.mark.asyncio
    async def test_423_not_retried(self) -> None:
        """423 should raise immediately — no retries."""
        resp = _resp(423, {"error": {"code": "itemLocked", "message": "locked"}})
        client, mock_http, _ = _client_with_mocks(resp)

        with pytest.raises(GraphLockedError):
            await client.get("t1", "/items/x")

        assert mock_http.request.call_count == 1


# ── 9. Token refresh delegation ─────────────────────────────────────


class TestTokenRefreshDelegation:
    """Verify that the client calls token_manager.acquire_token.

    Full 401 retry-loop coverage is in test_graph_auth_retry.py.
    """

    @pytest.mark.asyncio
    async def test_initial_request_acquires_token(self) -> None:
        tm = _mock_token_manager()
        client = GraphClient(tm)

        limiter = _mock_limiter()
        client._rate_limiters = MagicMock()
        client._rate_limiters.get = MagicMock(return_value=limiter)

        client._http = AsyncMock()
        client._http.request = AsyncMock(return_value=_resp(200, {"ok": True}))

        await client.get("t1", "/me")

        tm.acquire_token.assert_called_once_with("t1")

    @pytest.mark.asyncio
    async def test_auth_header_uses_token(self) -> None:
        tm = _mock_token_manager()
        tm.acquire_token.return_value = "my-secret-token"
        client = GraphClient(tm)

        limiter = _mock_limiter()
        client._rate_limiters = MagicMock()
        client._rate_limiters.get = MagicMock(return_value=limiter)

        client._http = AsyncMock()
        client._http.request = AsyncMock(return_value=_resp(200, {}))

        await client.get("t1", "/me")

        call_kwargs = client._http.request.call_args.kwargs
        assert call_kwargs["headers"]["Authorization"] == "Bearer my-secret-token"


# ── 10. RateLimit-Remaining → proactive backoff ─────────────────────


class TestRateLimitHeaders:
    @pytest.mark.asyncio
    async def test_consume_rate_headers_calls_apply_server_hint(self) -> None:
        resp = _resp(
            200,
            {"ok": True},
            headers={"RateLimit-Remaining": "42", "RateLimit-Reset": "30"},
        )
        client, _, limiter = _client_with_mocks(resp)

        await client.get("t1", "/items")

        limiter.apply_server_hint.assert_called_once_with(42, 30.0)

    @pytest.mark.asyncio
    async def test_no_rate_headers_does_not_call_hint(self) -> None:
        resp = _resp(200, {"ok": True})
        client, _, limiter = _client_with_mocks(resp)

        await client.get("t1", "/items")

        limiter.apply_server_hint.assert_not_called()

    @pytest.mark.asyncio
    async def test_rate_headers_on_retried_requests(self) -> None:
        """Rate headers should be consumed even on retryable error responses."""
        throttled = _resp(
            429,
            {"error": {"message": "throttled"}},
            headers={"Retry-After": "1", "RateLimit-Remaining": "0", "RateLimit-Reset": "60"},
        )
        ok = _resp(200, {"ok": True})
        client, _, limiter = _client_with_mocks([throttled, ok])

        with patch("app.services.graph_client.asyncio.sleep", new_callable=AsyncMock):
            await client.get("t1", "/items")

        # apply_server_hint called for the 429 response (with headers) but NOT
        # for the 200 (which has no rate-limit headers).
        assert limiter.apply_server_hint.call_count == 1
        limiter.apply_server_hint.assert_any_call(0, 60.0)

    def test_consume_rate_headers_static_method(self) -> None:
        """Unit-test _consume_rate_headers directly with bad values."""
        limiter = MagicMock()
        headers = httpx.Headers({"RateLimit-Remaining": "not-a-number", "RateLimit-Reset": "10"})
        # Should swallow ValueError, not raise
        GraphClient._consume_rate_headers(limiter, headers)
        limiter.apply_server_hint.assert_not_called()

    def test_consume_rate_headers_missing_reset(self) -> None:
        """Only Remaining without Reset should not call apply_server_hint."""
        limiter = MagicMock()
        headers = httpx.Headers({"RateLimit-Remaining": "5"})
        GraphClient._consume_rate_headers(limiter, headers)
        limiter.apply_server_hint.assert_not_called()
