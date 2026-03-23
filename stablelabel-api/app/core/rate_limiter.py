"""Token-bucket rate limiter for Graph API calls.

SharePoint/OneDrive uses resource-unit (RU) based throttling.  Write ops
(assignSensitivityLabel) cost 2 RU each.  Limits scale with tenant license
count and are dynamic — so we also honour RateLimit-Remaining headers from
responses as a proactive backoff signal.

Default: 5 requests/sec per tenant — conservative starting point.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field


@dataclass
class TokenBucket:
    """Per-tenant token bucket rate limiter."""

    rate: float = 5.0  # tokens per second
    capacity: float = 10.0  # burst capacity
    _tokens: float = field(init=False)
    _last_refill: float = field(init=False)
    _lock: asyncio.Lock = field(init=False, default_factory=asyncio.Lock)

    def __post_init__(self) -> None:
        self._tokens = self.capacity
        self._last_refill = time.monotonic()

    async def acquire(self, cost: float = 1.0) -> float:
        """Wait until enough tokens are available, then consume them.

        Returns the time spent waiting (seconds).
        """
        async with self._lock:
            waited = 0.0
            while True:
                self._refill()
                if self._tokens >= cost:
                    self._tokens -= cost
                    return waited
                deficit = cost - self._tokens
                delay = deficit / self.rate
                await asyncio.sleep(delay)
                waited += delay

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
        self._last_refill = now

    def apply_server_hint(self, remaining: int, reset_seconds: float) -> None:
        """Adjust tokens based on RateLimit-Remaining / RateLimit-Reset headers.

        Called after each Graph response to proactively slow down before 429.
        """
        if remaining <= 0:
            self._tokens = 0.0
        elif reset_seconds > 0:
            self.rate = min(self.rate, remaining / reset_seconds)


class TenantRateLimiters:
    """Registry of per-tenant rate limiters."""

    def __init__(self, default_rate: float = 5.0, default_capacity: float = 10.0) -> None:
        self._limiters: dict[str, TokenBucket] = {}
        self._default_rate = default_rate
        self._default_capacity = default_capacity

    def get(self, tenant_id: str) -> TokenBucket:
        # setdefault is atomic at the dict level — avoids TOCTOU where two
        # concurrent callers each create a separate TokenBucket and one
        # overwrites the other, losing its token state.
        return self._limiters.setdefault(
            tenant_id,
            TokenBucket(rate=self._default_rate, capacity=self._default_capacity),
        )
