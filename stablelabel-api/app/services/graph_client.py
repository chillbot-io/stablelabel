"""Microsoft Graph API client with built-in landmine guards.

Handles:
  - Retry with exponential backoff + jitter for 429/5xx/408
  - Honour Retry-After headers exactly
  - Per-tenant token-bucket rate limiting (proactive, not just reactive)
  - RateLimit-Remaining header consumption to slow down before 429
  - 423 Locked detection (checked-out files, DKE)
  - Structured error extraction from Graph error responses
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

from app.core.auth import TokenManager
from app.core.exceptions import (
    GraphAuthError,
    GraphLockedError,
    GraphThrottledError,
    StableLabelError,
)
from app.core.rate_limiter import TenantRateLimiters

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Retryable status codes
_RETRYABLE = frozenset({408, 429, 500, 502, 503, 504})

# Max retries — same as the PS module
_MAX_RETRIES = 3

# Write operations cost 2 resource units in SharePoint's throttling model
_WRITE_RU_COST = 2.0
_READ_RU_COST = 1.0


class GraphClient:
    """Async Graph API client — one per app instance, handles all tenants."""

    def __init__(
        self,
        token_manager: TokenManager,
        *,
        rate_limit: float = 5.0,
        rate_burst: float = 10.0,
    ) -> None:
        self._tokens = token_manager
        self._rate_limiters = TenantRateLimiters(
            default_rate=rate_limit, default_capacity=rate_burst
        )
        self._http = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers={"Accept": "application/json"},
        )

    async def close(self) -> None:
        await self._http.aclose()

    # ── Public verbs ──────────────────────────────────────────────

    async def get(self, tenant_id: str, path: str, **params: Any) -> dict[str, Any]:
        """GET request with pagination support."""
        return await self._request("GET", tenant_id, path, params=params)

    async def post(
        self, tenant_id: str, path: str, json: dict[str, Any] | None = None
    ) -> tuple[dict[str, Any], int, dict[str, str]]:
        """POST request — returns (body, status_code, headers).

        Callers need status + headers for 202 Accepted async operations.
        """
        return await self._request_full("POST", tenant_id, path, json=json)

    async def get_all_pages(
        self, tenant_id: str, path: str, **params: Any
    ) -> list[dict[str, Any]]:
        """Follow @odata.nextLink to collect all pages.

        Note: nextLink URLs from Microsoft already include all original query
        params ($filter, $select, etc.), so we do NOT re-append the caller's
        params on subsequent pages — that would double them up.
        """
        from urllib.parse import urlparse

        items: list[dict[str, Any]] = []
        result = await self.get(tenant_id, path, **params)
        items.extend(result.get("value", []))

        while next_link := result.get("@odata.nextLink"):
            # Validate nextLink points to Graph API to prevent SSRF
            parsed = urlparse(next_link)
            if parsed.hostname != "graph.microsoft.com":
                raise StableLabelError(
                    f"Refusing to follow @odata.nextLink to non-Graph host: {parsed.hostname}"
                )
            # nextLink is a full URL with all original query params baked in.
            # Pass it as-is (don't strip to relative — use the full URL so the
            # query string from Microsoft is preserved exactly).
            result = await self._request("GET", tenant_id, next_link)
            items.extend(result.get("value", []))

        return items

    async def poll_operation(
        self,
        location_url: str,
        *,
        poll_interval: float = 5.0,
        timeout: float = 600.0,
    ) -> dict[str, Any]:
        """Poll an async operation (Location header from 202 Accepted).

        The monitoring URL doesn't require auth — it's short-lived and unique.
        Returns the final status object.
        """
        # Validate URL to prevent SSRF — must be a Microsoft Graph domain
        from urllib.parse import urlparse

        parsed = urlparse(location_url)
        if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".microsoft.com"):
            raise StableLabelError(f"Refusing to poll non-Graph URL: {location_url}")

        elapsed = 0.0
        while elapsed < timeout:
            resp = await self._http.get(location_url)
            if resp.status_code == 200:
                body = resp.json()
                status = body.get("status", "")
                if status in ("completed", "failed"):
                    return body
                # still running — wait and retry
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        return {"status": "timeout", "elapsed": elapsed}

    # ── Internal machinery ────────────────────────────────────────

    async def _request(
        self,
        method: str,
        tenant_id: str,
        path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        body, _status, _headers = await self._request_full(method, tenant_id, path, **kwargs)
        return body

    async def _request_full(
        self,
        method: str,
        tenant_id: str,
        path: str,
        **kwargs: Any,
    ) -> tuple[dict[str, Any], int, dict[str, str]]:
        # Rate-limit before sending
        limiter = self._rate_limiters.get(tenant_id)
        cost = _WRITE_RU_COST if method in ("POST", "PATCH", "DELETE") else _READ_RU_COST
        await limiter.acquire(cost)

        token = self._tokens.acquire_token(tenant_id)
        headers = {"Authorization": f"Bearer {token}"}

        # Construct URL — only allow Graph API hosts to prevent SSRF
        if path.startswith("http"):
            from urllib.parse import urlparse
            parsed = urlparse(path)
            if parsed.hostname != "graph.microsoft.com":
                raise StableLabelError(
                    f"Refusing to send authenticated request to non-Graph host: {parsed.hostname}"
                )
            url = path
        else:
            url = f"{GRAPH_BASE}{path}"

        last_error: Exception | None = None
        auth_retried = False  # Track if we already refreshed the token
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = await self._http.request(method, url, headers=headers, **kwargs)
            except httpx.TransportError as exc:
                last_error = exc
                if attempt < _MAX_RETRIES:
                    await self._backoff(attempt)
                    continue
                raise StableLabelError(f"Transport error after {_MAX_RETRIES} retries: {exc}")

            # Feed rate-limit headers back to the bucket
            self._consume_rate_headers(limiter, resp.headers)

            # Happy path
            if resp.status_code < 400:
                if resp.content:
                    try:
                        body = resp.json()
                    except ValueError:
                        body = {}
                else:
                    body = {}
                return body, resp.status_code, dict(resp.headers)

            # 423 Locked — file checked out, DKE, or mid-sync
            if resp.status_code == 423:
                raise GraphLockedError(
                    f"File locked (423): {self._extract_error(resp)}"
                )

            # 401 — token might have expired mid-batch; refresh once
            if resp.status_code == 401:
                if auth_retried:
                    raise GraphAuthError(
                        f"Authentication failed after token refresh: {self._extract_error(resp)}"
                    )
                auth_retried = True
                token = self._tokens.acquire_token(tenant_id)
                headers["Authorization"] = f"Bearer {token}"
                continue

            # Retryable errors
            if resp.status_code in _RETRYABLE:
                retry_after = float(resp.headers.get("Retry-After", "0"))
                last_error = GraphThrottledError(
                    retry_after=retry_after,
                    message=self._extract_error(resp),
                )
                if attempt < _MAX_RETRIES:
                    if retry_after > 0:
                        logger.warning(
                            "Throttled (attempt %d/%d), waiting %.1fs (Retry-After)",
                            attempt + 1,
                            _MAX_RETRIES,
                            retry_after,
                        )
                        await asyncio.sleep(retry_after)
                    else:
                        await self._backoff(attempt)
                    continue

            # Non-retryable error
            raise StableLabelError(
                f"Graph API {resp.status_code}: {self._extract_error(resp)}"
            )

        raise last_error or StableLabelError("Request failed after retries")

    @staticmethod
    async def _backoff(attempt: int) -> None:
        """Exponential backoff with jitter: 2^attempt ± random."""
        base = min(2**attempt, 60)
        jitter = random.uniform(0, base * 0.5)  # noqa: S311
        await asyncio.sleep(base + jitter)

    @staticmethod
    def _extract_error(resp: httpx.Response) -> str:
        """Pull the most useful error message from a Graph error response."""
        try:
            body = resp.json()
            err = body.get("error", {})
            msg = err.get("message", "")
            code = err.get("code", "")
            inner = err.get("innerError", {}).get("code", "")
            parts = [p for p in [code, inner, msg] if p]
            return " / ".join(parts) if parts else resp.text[:500]
        except Exception:
            return resp.text[:500]

    @staticmethod
    def _consume_rate_headers(limiter: Any, headers: httpx.Headers) -> None:
        """Proactively adjust rate limiter from RateLimit-* headers.

        SharePoint sends these when you're at 80% of your limit —
        slowing down here prevents hitting 429.
        """
        remaining = headers.get("RateLimit-Remaining")
        reset = headers.get("RateLimit-Reset")
        if remaining is not None and reset is not None:
            try:
                limiter.apply_server_hint(int(remaining), float(reset))
            except ValueError:
                pass
