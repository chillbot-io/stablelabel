"""Tests for SSE progress event formatting and terminal state definitions.

Duplicates constants to avoid the jose import chain from app.routers.jobs.
"""

import json


# Duplicated from app.routers.jobs — must match
_TERMINAL_STATUSES = frozenset({"completed", "failed", "rolled_back", "paused"})


def _sse_event(data: dict, event: str = "progress") -> str:
    """Duplicated from app.routers.jobs._sse_event."""
    payload = json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


class TestSseEventFormatting:
    def test_format_progress_event(self) -> None:
        result = _sse_event({"status": "running", "total_files": 100})
        assert result.startswith("event: progress\n")
        assert "data: " in result
        assert result.endswith("\n\n")

    def test_format_error_event(self) -> None:
        result = _sse_event({"error": "not found"}, event="error")
        assert result.startswith("event: error\n")
        assert '"error": "not found"' in result

    def test_data_is_valid_json(self) -> None:
        data = {"status": "running", "processed_files": 42, "total_files": 100}
        result = _sse_event(data)
        for line in result.splitlines():
            if line.startswith("data: "):
                payload = line[len("data: "):]
                parsed = json.loads(payload)
                assert parsed == data
                break
        else:
            raise AssertionError("No data line found")

    def test_custom_event_type(self) -> None:
        result = _sse_event({"msg": "hello"}, event="custom")
        assert "event: custom\n" in result

    def test_double_newline_terminates_event(self) -> None:
        """SSE spec requires events to end with \\n\\n."""
        result = _sse_event({"a": 1})
        assert result.endswith("\n\n")
        # Should not have triple newline
        assert not result.endswith("\n\n\n")


class TestTerminalStatuses:
    def test_completed_is_terminal(self) -> None:
        assert "completed" in _TERMINAL_STATUSES

    def test_failed_is_terminal(self) -> None:
        assert "failed" in _TERMINAL_STATUSES

    def test_rolled_back_is_terminal(self) -> None:
        assert "rolled_back" in _TERMINAL_STATUSES

    def test_paused_is_terminal(self) -> None:
        assert "paused" in _TERMINAL_STATUSES

    def test_running_is_not_terminal(self) -> None:
        assert "running" not in _TERMINAL_STATUSES

    def test_enumerating_is_not_terminal(self) -> None:
        assert "enumerating" not in _TERMINAL_STATUSES

    def test_pending_is_not_terminal(self) -> None:
        assert "pending" not in _TERMINAL_STATUSES

    def test_rolling_back_is_not_terminal(self) -> None:
        assert "rolling_back" not in _TERMINAL_STATUSES
