"""Tests for the token-bucket rate limiter."""

import asyncio

import pytest

from app.core.rate_limiter import TenantRateLimiters, TokenBucket


class TestTokenBucket:
    @pytest.mark.asyncio
    async def test_acquire_within_capacity(self) -> None:
        bucket = TokenBucket(rate=10.0, capacity=10.0)
        waited = await bucket.acquire(1.0)
        assert waited == 0.0

    @pytest.mark.asyncio
    async def test_acquire_drains_bucket(self) -> None:
        bucket = TokenBucket(rate=100.0, capacity=3.0)
        # Drain all 3 tokens
        for _ in range(3):
            await bucket.acquire(1.0)
        # Next one should wait (briefly, since rate is high)
        waited = await bucket.acquire(1.0)
        assert waited > 0

    def test_server_hint_zeros_tokens(self) -> None:
        bucket = TokenBucket(rate=10.0, capacity=10.0)
        bucket.apply_server_hint(remaining=0, reset_seconds=5.0)
        assert bucket._tokens == 0.0

    def test_server_hint_adjusts_rate(self) -> None:
        bucket = TokenBucket(rate=10.0, capacity=10.0)
        bucket.apply_server_hint(remaining=5, reset_seconds=10.0)
        assert bucket.rate == 0.5  # 5 remaining / 10 seconds


class TestTenantRateLimiters:
    def test_creates_per_tenant(self) -> None:
        registry = TenantRateLimiters()
        a = registry.get("tenant-a")
        b = registry.get("tenant-b")
        assert a is not b

    def test_reuses_existing(self) -> None:
        registry = TenantRateLimiters()
        a1 = registry.get("tenant-a")
        a2 = registry.get("tenant-a")
        assert a1 is a2
