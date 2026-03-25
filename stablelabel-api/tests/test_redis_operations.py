"""Tests for async Redis job-signal operations (send, check, ack)."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.core.redis import (
    JobSignal,
    _SIGNAL_TTL,
    _signal_key,
    ack_job_signal,
    check_job_signal,
    send_job_signal,
)

JOB_ID = "test-job-550e8400"


@pytest.fixture
def mock_redis() -> AsyncMock:
    """Return an AsyncMock that behaves like redis.asyncio.Redis."""
    r = AsyncMock()
    # By default, GET returns None (no signal set).
    r.get.return_value = None
    return r


# ── send_job_signal ──────────────────────────────────────────────


class TestSendJobSignal:
    @pytest.mark.asyncio
    async def test_sets_pause_signal(self, mock_redis: AsyncMock) -> None:
        await send_job_signal(mock_redis, JOB_ID, JobSignal.PAUSE)

        mock_redis.set.assert_awaited_once_with(
            _signal_key(JOB_ID),
            "pause",
            ex=_SIGNAL_TTL,
        )

    @pytest.mark.asyncio
    async def test_sets_cancel_signal(self, mock_redis: AsyncMock) -> None:
        await send_job_signal(mock_redis, JOB_ID, JobSignal.CANCEL)

        mock_redis.set.assert_awaited_once_with(
            _signal_key(JOB_ID),
            "cancel",
            ex=_SIGNAL_TTL,
        )

    @pytest.mark.asyncio
    async def test_ttl_is_24_hours(self, mock_redis: AsyncMock) -> None:
        assert _SIGNAL_TTL == 86400, "TTL must be 24 hours in seconds"

        await send_job_signal(mock_redis, JOB_ID, JobSignal.PAUSE)

        _, kwargs = mock_redis.set.call_args
        assert kwargs["ex"] == 86400


# ── check_job_signal ─────────────────────────────────────────────


class TestCheckJobSignal:
    @pytest.mark.asyncio
    async def test_returns_none_when_not_set(self, mock_redis: AsyncMock) -> None:
        mock_redis.get.return_value = None

        result = await check_job_signal(mock_redis, JOB_ID)

        assert result is None
        mock_redis.get.assert_awaited_once_with(_signal_key(JOB_ID))

    @pytest.mark.asyncio
    async def test_returns_pause_signal_from_bytes(self, mock_redis: AsyncMock) -> None:
        mock_redis.get.return_value = b"pause"

        result = await check_job_signal(mock_redis, JOB_ID)

        assert result is JobSignal.PAUSE

    @pytest.mark.asyncio
    async def test_returns_cancel_signal_from_bytes(self, mock_redis: AsyncMock) -> None:
        mock_redis.get.return_value = b"cancel"

        result = await check_job_signal(mock_redis, JOB_ID)

        assert result is JobSignal.CANCEL

    @pytest.mark.asyncio
    async def test_returns_signal_from_str(self, mock_redis: AsyncMock) -> None:
        """Redis configured with decode_responses=True returns str, not bytes."""
        mock_redis.get.return_value = "pause"

        result = await check_job_signal(mock_redis, JOB_ID)

        assert result is JobSignal.PAUSE

    @pytest.mark.asyncio
    async def test_invalid_value_raises(self, mock_redis: AsyncMock) -> None:
        mock_redis.get.return_value = b"garbage"

        with pytest.raises(ValueError, match="garbage"):
            await check_job_signal(mock_redis, JOB_ID)

    @pytest.mark.asyncio
    async def test_corrupted_empty_bytes_raises(self, mock_redis: AsyncMock) -> None:
        mock_redis.get.return_value = b""

        with pytest.raises(ValueError):
            await check_job_signal(mock_redis, JOB_ID)

    @pytest.mark.asyncio
    async def test_corrupted_str_raises(self, mock_redis: AsyncMock) -> None:
        mock_redis.get.return_value = "not_a_signal"

        with pytest.raises(ValueError, match="not_a_signal"):
            await check_job_signal(mock_redis, JOB_ID)


# ── ack_job_signal ───────────────────────────────────────────────


class TestAckJobSignal:
    @pytest.mark.asyncio
    async def test_deletes_signal_key(self, mock_redis: AsyncMock) -> None:
        await ack_job_signal(mock_redis, JOB_ID)

        mock_redis.delete.assert_awaited_once_with(_signal_key(JOB_ID))

    @pytest.mark.asyncio
    async def test_ack_is_idempotent(self, mock_redis: AsyncMock) -> None:
        """Acking a non-existent signal should not raise."""
        mock_redis.delete.return_value = 0  # key didn't exist

        await ack_job_signal(mock_redis, JOB_ID)  # should not raise


# ── Round-trip integration ───────────────────────────────────────


class TestRoundTrip:
    @pytest.mark.asyncio
    async def test_send_check_ack_check(self) -> None:
        """Full lifecycle: send -> check sees it -> ack -> check returns None."""
        store: dict[str, str] = {}

        redis = AsyncMock()

        async def fake_set(key: str, value: str, **kwargs: object) -> None:
            store[key] = value

        async def fake_get(key: str) -> bytes | None:
            val = store.get(key)
            return val.encode() if val is not None else None

        async def fake_delete(key: str) -> int:
            return 1 if store.pop(key, None) is not None else 0

        redis.set.side_effect = fake_set
        redis.get.side_effect = fake_get
        redis.delete.side_effect = fake_delete

        # 1. send
        await send_job_signal(redis, JOB_ID, JobSignal.PAUSE)

        # 2. check — signal is present
        result = await check_job_signal(redis, JOB_ID)
        assert result is JobSignal.PAUSE

        # 3. ack — clears signal
        await ack_job_signal(redis, JOB_ID)

        # 4. check — signal is gone
        result = await check_job_signal(redis, JOB_ID)
        assert result is None

    @pytest.mark.asyncio
    async def test_last_signal_wins(self) -> None:
        """Sending PAUSE then CANCEL overwrites; last signal wins."""
        store: dict[str, str] = {}

        redis = AsyncMock()

        async def fake_set(key: str, value: str, **kwargs: object) -> None:
            store[key] = value

        async def fake_get(key: str) -> bytes | None:
            val = store.get(key)
            return val.encode() if val is not None else None

        redis.set.side_effect = fake_set
        redis.get.side_effect = fake_get

        await send_job_signal(redis, JOB_ID, JobSignal.PAUSE)
        result = await check_job_signal(redis, JOB_ID)
        assert result is JobSignal.PAUSE

        await send_job_signal(redis, JOB_ID, JobSignal.CANCEL)
        result = await check_job_signal(redis, JOB_ID)
        assert result is JobSignal.CANCEL
