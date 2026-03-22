"""Tests for Redis job pause/cancel signaling."""

from app.core.redis import JobSignal, _signal_key


class TestSignalKey:
    def test_key_format(self) -> None:
        assert _signal_key("abc-123") == "job:abc-123:signal"

    def test_key_includes_job_id(self) -> None:
        key = _signal_key("550e8400-e29b-41d4-a716-446655440000")
        assert "550e8400-e29b-41d4-a716-446655440000" in key


class TestJobSignalEnum:
    def test_roundtrip_all_members(self) -> None:
        """Every signal value can be serialized to string and parsed back."""
        for sig in JobSignal:
            assert JobSignal(sig.value) == sig

    def test_all_members_are_lowercase_strings(self) -> None:
        """Signal values must be simple lowercase strings for Redis storage."""
        for sig in JobSignal:
            assert sig.value == sig.value.lower()
            assert sig.value.isalpha()

    def test_enum_has_pause_and_cancel(self) -> None:
        """At minimum, pause and cancel must exist."""
        members = {s.name for s in JobSignal}
        assert "PAUSE" in members
        assert "CANCEL" in members
