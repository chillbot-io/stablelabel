"""Tests for GraphClient 401 retry behaviour.

Verifies that a 401 triggers exactly one token refresh, and that a second
consecutive 401 raises GraphAuthError (no infinite loop).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.exceptions import GraphAuthError
from app.services.graph_client import GraphClient


def _mock_token_manager() -> MagicMock:
    """Create a mock TokenManager that returns fake tokens."""
    tm = MagicMock()
    tm.acquire_token = MagicMock(return_value="fake-token-refreshed")
    return tm


def _make_response(status_code: int, body: dict | None = None) -> httpx.Response:
    """Build a fake httpx.Response with the given status and optional JSON body."""
    resp = httpx.Response(
        status_code=status_code,
        json=body or {},
        request=httpx.Request("GET", "https://graph.microsoft.com/v1.0/test"),
    )
    return resp


class TestGraphClient401Retry:
    """Verify 401 handling: refresh once, then raise on second 401."""

    @pytest.mark.asyncio
    async def test_401_refreshes_token_once(self) -> None:
        """Two consecutive 401s should raise GraphAuthError, not loop forever."""
        tm = _mock_token_manager()
        client = GraphClient(tm)

        # Mock the rate limiter to be a no-op
        mock_limiter = MagicMock()
        mock_limiter.acquire = AsyncMock()
        mock_limiter.apply_server_hint = MagicMock()
        client._rate_limiters = MagicMock()
        client._rate_limiters.get = MagicMock(return_value=mock_limiter)

        # Both calls return 401
        resp_401 = _make_response(401, {"error": {"message": "Unauthorized", "code": "InvalidAuthenticationToken"}})

        client._http = AsyncMock()
        client._http.request = AsyncMock(return_value=resp_401)

        with pytest.raises(GraphAuthError):
            await client.get("tenant-1", "/me")

        # Token was refreshed exactly twice: once at start, once after first 401
        assert tm.acquire_token.call_count == 2

    @pytest.mark.asyncio
    async def test_401_refresh_succeeds(self) -> None:
        """First call returns 401, refresh token, second call returns 200."""
        tm = _mock_token_manager()
        client = GraphClient(tm)

        # Mock the rate limiter
        mock_limiter = MagicMock()
        mock_limiter.acquire = AsyncMock()
        mock_limiter.apply_server_hint = MagicMock()
        client._rate_limiters = MagicMock()
        client._rate_limiters.get = MagicMock(return_value=mock_limiter)

        resp_401 = _make_response(401, {"error": {"message": "Unauthorized"}})
        resp_200 = _make_response(200, {"value": [{"id": "file-1"}]})

        client._http = AsyncMock()
        client._http.request = AsyncMock(side_effect=[resp_401, resp_200])

        result = await client.get("tenant-1", "/me/drive/items")

        assert result == {"value": [{"id": "file-1"}]}
        # Token acquired twice: initial + refresh after 401
        assert tm.acquire_token.call_count == 2

    @pytest.mark.asyncio
    async def test_401_does_not_infinite_loop(self) -> None:
        """Ensure the request loop terminates even if 401 keeps returning."""
        tm = _mock_token_manager()
        client = GraphClient(tm)

        mock_limiter = MagicMock()
        mock_limiter.acquire = AsyncMock()
        mock_limiter.apply_server_hint = MagicMock()
        client._rate_limiters = MagicMock()
        client._rate_limiters.get = MagicMock(return_value=mock_limiter)

        # Always returns 401
        resp_401 = _make_response(401, {"error": {"message": "Bad token"}})
        client._http = AsyncMock()
        client._http.request = AsyncMock(return_value=resp_401)

        with pytest.raises(GraphAuthError):
            await client.get("tenant-1", "/test")

        # Should not call request more than a few times (initial + retry after refresh)
        assert client._http.request.call_count <= 4
