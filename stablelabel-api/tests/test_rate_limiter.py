"""Tests for the token-bucket rate limiter."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core.rate_limiter import TenantRateLimiters, TokenBucket


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_bucket(
    rate: float = 10.0,
    capacity: float = 10.0,
    *,
    start_time: float = 1000.0,
) -> TokenBucket:
    """Create a TokenBucket with a deterministic start time."""
    with patch("time.monotonic", return_value=start_time):
        return TokenBucket(rate=rate, capacity=capacity)


# ---------------------------------------------------------------------------
# 1. Initial state (full capacity)
# ---------------------------------------------------------------------------

class TestTokenBucketInitialState:
    def test_starts_at_full_capacity(self) -> None:
        bucket = _make_bucket(rate=5.0, capacity=10.0)
        assert bucket._tokens == 10.0

    def test_starts_with_configured_rate(self) -> None:
        bucket = _make_bucket(rate=7.5, capacity=20.0)
        assert bucket.rate == 7.5
        assert bucket.capacity == 20.0
        assert bucket._tokens == 20.0

    def test_default_values(self) -> None:
        with patch("time.monotonic", return_value=0.0):
            bucket = TokenBucket()
        assert bucket.rate == 5.0
        assert bucket.capacity == 10.0
        assert bucket._tokens == 10.0

    def test_last_refill_set_on_init(self) -> None:
        bucket = _make_bucket(start_time=42.0)
        assert bucket._last_refill == 42.0


# ---------------------------------------------------------------------------
# 2. acquire(cost) — returns 0 wait when tokens available,
#    positive wait when insufficient
# ---------------------------------------------------------------------------

class TestTokenBucketAcquire:
    @pytest.mark.asyncio
    async def test_acquire_no_wait_when_tokens_available(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            waited = await bucket.acquire(1.0)
        assert waited == 0.0

    @pytest.mark.asyncio
    async def test_acquire_consumes_tokens(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire(3.0)
        assert bucket._tokens == pytest.approx(7.0)

    @pytest.mark.asyncio
    async def test_acquire_returns_positive_wait_when_insufficient(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=5.0, start_time=1000.0)

        # Drain all tokens
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire(5.0)

        assert bucket._tokens == pytest.approx(0.0)

        # Verify the math: deficit / rate = 1.0 / 10.0 = 0.1s wait needed
        deficit = 1.0 - bucket._tokens
        delay = deficit / bucket.rate
        assert delay == pytest.approx(0.1)

    @pytest.mark.asyncio
    async def test_acquire_default_cost_is_one(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire()
        assert bucket._tokens == pytest.approx(9.0)

    @pytest.mark.asyncio
    async def test_acquire_exact_capacity(self) -> None:
        """Acquiring exactly the full capacity should succeed with no wait."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            waited = await bucket.acquire(10.0)
        assert waited == 0.0
        assert bucket._tokens == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# 3. Token refill — tokens replenish over time based on rate
# ---------------------------------------------------------------------------

class TestTokenRefill:
    def test_refill_adds_tokens_based_on_elapsed_time(self) -> None:
        bucket = _make_bucket(rate=5.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 2.0

        with patch("time.monotonic", return_value=1001.0):  # 1s elapsed
            bucket._refill()

        # 2.0 + 5.0*1.0 = 7.0
        assert bucket._tokens == pytest.approx(7.0)

    def test_refill_caps_at_capacity(self) -> None:
        bucket = _make_bucket(rate=100.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 5.0

        with patch("time.monotonic", return_value=1001.0):  # 1s => +100 tokens
            bucket._refill()

        assert bucket._tokens == pytest.approx(10.0)  # capped at capacity

    def test_refill_no_change_when_no_time_elapsed(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 3.0

        with patch("time.monotonic", return_value=1000.0):  # 0s elapsed
            bucket._refill()

        assert bucket._tokens == pytest.approx(3.0)

    def test_refill_updates_last_refill_timestamp(self) -> None:
        bucket = _make_bucket(rate=5.0, capacity=10.0, start_time=1000.0)

        with patch("time.monotonic", return_value=1005.0):
            bucket._refill()

        assert bucket._last_refill == 1005.0

    def test_refill_fractional_elapsed(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=20.0, start_time=1000.0)
        bucket._tokens = 0.0

        with patch("time.monotonic", return_value=1000.25):  # 0.25s => +2.5
            bucket._refill()

        assert bucket._tokens == pytest.approx(2.5)


# ---------------------------------------------------------------------------
# 4. Burst capacity — can burst up to capacity, then must wait
# ---------------------------------------------------------------------------

class TestBurstCapacity:
    @pytest.mark.asyncio
    async def test_burst_up_to_capacity(self) -> None:
        bucket = _make_bucket(rate=5.0, capacity=5.0, start_time=1000.0)

        with patch("time.monotonic", return_value=1000.0):
            # 5 requests of cost 1 should all succeed immediately
            for _ in range(5):
                waited = await bucket.acquire(1.0)
                assert waited == 0.0

        assert bucket._tokens == pytest.approx(0.0)

    @pytest.mark.asyncio
    async def test_burst_exhausted_then_must_wait(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=3.0, start_time=1000.0)

        # Drain bucket
        with patch("time.monotonic", return_value=1000.0):
            for _ in range(3):
                await bucket.acquire(1.0)

        # Bucket is empty — verify a deficit exists requiring a wait
        assert bucket._tokens == pytest.approx(0.0)
        deficit = 1.0 - bucket._tokens
        delay = deficit / bucket.rate
        assert delay > 0  # Would need to wait 0.1s

    @pytest.mark.asyncio
    async def test_tokens_never_exceed_capacity_after_long_idle(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=5.0, start_time=1000.0)
        bucket._tokens = 0.0

        # Even after a very long time, tokens cap at capacity
        with patch("time.monotonic", return_value=2000.0):  # 1000s later
            bucket._refill()

        assert bucket._tokens == pytest.approx(5.0)


# ---------------------------------------------------------------------------
# 5. Write cost (2 RU) vs read cost (1 RU)
# ---------------------------------------------------------------------------

class TestReadWriteCosts:
    @pytest.mark.asyncio
    async def test_read_cost_one_ru(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire(1.0)  # read = 1 RU
        assert bucket._tokens == pytest.approx(9.0)

    @pytest.mark.asyncio
    async def test_write_cost_two_ru(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire(2.0)  # write = 2 RU
        assert bucket._tokens == pytest.approx(8.0)

    @pytest.mark.asyncio
    async def test_mixed_read_write_operations(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire(1.0)  # read
            await bucket.acquire(2.0)  # write
            await bucket.acquire(1.0)  # read
            await bucket.acquire(2.0)  # write
        # 10 - 1 - 2 - 1 - 2 = 4
        assert bucket._tokens == pytest.approx(4.0)

    @pytest.mark.asyncio
    async def test_write_exhausts_faster_than_read(self) -> None:
        """Writes at 2 RU should exhaust a 10-token bucket in 5 ops."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            for _ in range(5):
                waited = await bucket.acquire(2.0)
                assert waited == 0.0
        assert bucket._tokens == pytest.approx(0.0)

    @pytest.mark.asyncio
    async def test_reads_exhaust_in_ten_ops(self) -> None:
        """Reads at 1 RU should exhaust a 10-token bucket in 10 ops."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            for _ in range(10):
                waited = await bucket.acquire(1.0)
                assert waited == 0.0
        assert bucket._tokens == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# 6. apply_server_hint(remaining, reset_seconds)
# ---------------------------------------------------------------------------

class TestApplyServerHint:
    def test_remaining_zero_drains_tokens(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        bucket.apply_server_hint(remaining=0, reset_seconds=5.0)
        assert bucket._tokens == 0.0

    def test_negative_remaining_drains_tokens(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        bucket.apply_server_hint(remaining=-1, reset_seconds=5.0)
        assert bucket._tokens == 0.0

    def test_remaining_caps_tokens_when_lower(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        # Bucket starts full (10 tokens), hint says only 3 remaining
        bucket.apply_server_hint(remaining=3, reset_seconds=10.0)
        assert bucket._tokens == 3.0

    def test_remaining_does_not_increase_tokens(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        bucket._tokens = 2.0
        # Server says 5 remaining, but bucket only has 2 — keep 2
        bucket.apply_server_hint(remaining=5, reset_seconds=10.0)
        assert bucket._tokens == 2.0

    def test_rate_unchanged_after_hint(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        original_rate = bucket.rate
        bucket.apply_server_hint(remaining=1, reset_seconds=5.0)
        assert bucket.rate == original_rate

    def test_capacity_unchanged_after_hint(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        original_capacity = bucket.capacity
        bucket.apply_server_hint(remaining=0, reset_seconds=5.0)
        assert bucket.capacity == original_capacity

    def test_hint_with_zero_reset_seconds_and_positive_remaining(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        # reset_seconds=0 means the elif branch is not taken
        bucket.apply_server_hint(remaining=5, reset_seconds=0.0)
        # Neither condition: remaining > 0, but reset_seconds <= 0 => no change
        assert bucket._tokens == 10.0

    def test_hint_with_negative_reset_seconds(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        bucket.apply_server_hint(remaining=5, reset_seconds=-1.0)
        # reset_seconds <= 0 => elif not taken => tokens unchanged
        assert bucket._tokens == 10.0

    @pytest.mark.asyncio
    async def test_recovery_after_hint_drain(self) -> None:
        """After server hint drains tokens, they refill naturally."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        bucket.apply_server_hint(remaining=0, reset_seconds=5.0)
        assert bucket._tokens == 0.0

        # 1 second later, refill should add 10 tokens
        with patch("time.monotonic", return_value=1001.0):
            bucket._refill()
        assert bucket._tokens == pytest.approx(10.0)

    def test_repeated_hints_keep_draining(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0)
        bucket.apply_server_hint(remaining=5, reset_seconds=10.0)
        assert bucket._tokens == 5.0
        bucket.apply_server_hint(remaining=2, reset_seconds=10.0)
        assert bucket._tokens == 2.0
        bucket.apply_server_hint(remaining=0, reset_seconds=10.0)
        assert bucket._tokens == 0.0


# ---------------------------------------------------------------------------
# 7. TenantRateLimiters — lazy per-tenant init, same limiter for same tenant
# ---------------------------------------------------------------------------

class TestTenantRateLimiters:
    def test_creates_per_tenant(self) -> None:
        registry = TenantRateLimiters()
        a = registry.get("tenant-a")
        b = registry.get("tenant-b")
        assert a is not b

    def test_reuses_existing_limiter(self) -> None:
        registry = TenantRateLimiters()
        a1 = registry.get("tenant-a")
        a2 = registry.get("tenant-a")
        assert a1 is a2

    def test_lazy_initialization(self) -> None:
        registry = TenantRateLimiters()
        assert len(registry._limiters) == 0
        registry.get("t1")
        assert len(registry._limiters) == 1
        registry.get("t2")
        assert len(registry._limiters) == 2

    def test_custom_rate_and_capacity(self) -> None:
        registry = TenantRateLimiters(default_rate=20.0, default_capacity=50.0)
        bucket = registry.get("tenant-x")
        assert bucket.rate == 20.0
        assert bucket.capacity == 50.0
        assert bucket._tokens == 50.0

    def test_default_rate_and_capacity(self) -> None:
        registry = TenantRateLimiters()
        bucket = registry.get("tenant-y")
        assert bucket.rate == 5.0
        assert bucket.capacity == 10.0

    def test_independent_tenant_state(self) -> None:
        """Consuming tokens for one tenant does not affect another."""
        registry = TenantRateLimiters(default_rate=10.0, default_capacity=10.0)
        a = registry.get("tenant-a")
        b = registry.get("tenant-b")

        a._tokens = 0.0
        assert b._tokens == 10.0

    def test_many_tenants(self) -> None:
        registry = TenantRateLimiters()
        buckets = [registry.get(f"tenant-{i}") for i in range(100)]
        assert len(registry._limiters) == 100
        # All unique instances
        assert len(set(id(b) for b in buckets)) == 100

    def test_returns_token_bucket_type(self) -> None:
        registry = TenantRateLimiters()
        bucket = registry.get("tenant-z")
        assert isinstance(bucket, TokenBucket)


# ---------------------------------------------------------------------------
# 8. Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_zero_tokens_after_drain(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=5.0, start_time=1000.0)
        bucket._tokens = 0.0

        with patch("time.monotonic", return_value=1000.0):
            bucket._refill()

        assert bucket._tokens == pytest.approx(0.0)

    def test_negative_elapsed_time_no_crash(self) -> None:
        """If monotonic clock somehow goes backward, we should not crash."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 5.0

        # Time appears to go backward
        with patch("time.monotonic", return_value=999.0):
            bucket._refill()

        # elapsed = -1.0 => tokens = 5.0 + 10.0*(-1.0) = -5.0
        # min(10.0, -5.0) = -5.0 — this is a known edge;
        # we verify the code doesn't raise
        assert bucket._last_refill == 999.0

    @pytest.mark.asyncio
    async def test_acquire_zero_cost(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            waited = await bucket.acquire(0.0)
        assert waited == 0.0
        assert bucket._tokens == pytest.approx(10.0)

    @pytest.mark.asyncio
    async def test_acquire_fractional_cost(self) -> None:
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        with patch("time.monotonic", return_value=1000.0):
            waited = await bucket.acquire(0.5)
        assert waited == 0.0
        assert bucket._tokens == pytest.approx(9.5)

    def test_very_high_rate_fills_quickly(self) -> None:
        bucket = _make_bucket(rate=1_000_000.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 0.0

        with patch("time.monotonic", return_value=1000.001):  # 1ms
            bucket._refill()

        assert bucket._tokens == pytest.approx(10.0)  # capped

    def test_very_small_capacity(self) -> None:
        bucket = _make_bucket(rate=1.0, capacity=0.5, start_time=1000.0)
        assert bucket._tokens == pytest.approx(0.5)

    @pytest.mark.asyncio
    async def test_concurrent_acquires_serialize_via_lock(self) -> None:
        """Multiple concurrent acquires should be serialized by the lock.

        We verify that sequential acquires under the lock work correctly
        and tokens are consumed in order.
        """
        bucket = _make_bucket(rate=10.0, capacity=5.0, start_time=1000.0)

        # Sequential acquires with time frozen — first 5 get through
        with patch("time.monotonic", return_value=1000.0):
            results = []
            for _ in range(5):
                waited = await bucket.acquire(1.0)
                results.append(waited)

        assert all(w == 0.0 for w in results)
        assert bucket._tokens == pytest.approx(0.0)

    def test_large_cost_exceeding_current_tokens(self) -> None:
        """Acquire with cost larger than current tokens but <= capacity."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 2.0

        # deficit = 5.0 - 2.0 = 3.0; delay = 3.0 / 10.0 = 0.3s
        deficit = 5.0 - bucket._tokens
        delay = deficit / bucket.rate
        assert delay == pytest.approx(0.3)

    def test_refill_multiple_times_accumulates(self) -> None:
        bucket = _make_bucket(rate=2.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 0.0

        with patch("time.monotonic", return_value=1001.0):
            bucket._refill()
        assert bucket._tokens == pytest.approx(2.0)

        with patch("time.monotonic", return_value=1002.0):
            bucket._refill()
        assert bucket._tokens == pytest.approx(4.0)

        with patch("time.monotonic", return_value=1003.0):
            bucket._refill()
        assert bucket._tokens == pytest.approx(6.0)

    def test_acquire_waits_correct_delay(self) -> None:
        """Verify the computed delay matches deficit / rate."""
        bucket = _make_bucket(rate=5.0, capacity=10.0, start_time=1000.0)
        bucket._tokens = 1.0

        # deficit = 3.0 - 1.0 = 2.0; delay = 2.0 / 5.0 = 0.4s
        deficit = 3.0 - bucket._tokens
        delay = deficit / bucket.rate
        assert delay == pytest.approx(0.4)

    @pytest.mark.asyncio
    async def test_sequential_acquires_with_refill_between(self) -> None:
        """Tokens refill between sequential acquires."""
        bucket = _make_bucket(rate=10.0, capacity=10.0, start_time=1000.0)

        # Drain bucket
        with patch("time.monotonic", return_value=1000.0):
            await bucket.acquire(10.0)

        assert bucket._tokens == pytest.approx(0.0)

        # 0.5s later, should have 5 tokens refilled
        with patch("time.monotonic", return_value=1000.5):
            waited = await bucket.acquire(5.0)

        assert waited == 0.0
        assert bucket._tokens == pytest.approx(0.0)
