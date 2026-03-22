"""Tests for Redis job pause/cancel signaling."""

import pytest

from app.core.redis import JobSignal, _signal_key


class TestSignalKey:
    def test_key_format(self) -> None:
        assert _signal_key("abc-123") == "job:abc-123:signal"

    def test_key_includes_job_id(self) -> None:
        key = _signal_key("550e8400-e29b-41d4-a716-446655440000")
        assert "550e8400-e29b-41d4-a716-446655440000" in key


class TestJobSignalEnum:
    def test_pause_value(self) -> None:
        assert JobSignal.PAUSE == "pause"

    def test_cancel_value(self) -> None:
        assert JobSignal.CANCEL == "cancel"

    def test_roundtrip(self) -> None:
        """Signal can be serialized to string and parsed back."""
        for sig in JobSignal:
            assert JobSignal(sig.value) == sig
