"""Tests for SSE progress event formatting and terminal state definitions.

Imports real TERMINAL_STATUSES from app.core.job_states.
Duplicates _sse_event since it lives in a module with jose dependency.
"""

import json

from app.core.job_states import TERMINAL_STATUSES


def _sse_event(data: dict, event: str = "progress") -> str:
    """Matches app.routers.jobs._sse_event — duplicated to avoid jose import."""
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
                parsed = json.loads(line[len("data: "):])
                assert parsed == data
                break
        else:
            raise AssertionError("No data line found")

    def test_double_newline_terminates_event(self) -> None:
        result = _sse_event({"a": 1})
        assert result.endswith("\n\n")
        assert not result.endswith("\n\n\n")


class TestTerminalStatuses:
    def test_completed_is_terminal(self) -> None:
        assert "completed" in TERMINAL_STATUSES

    def test_failed_is_terminal(self) -> None:
        assert "failed" in TERMINAL_STATUSES

    def test_rolled_back_is_terminal(self) -> None:
        assert "rolled_back" in TERMINAL_STATUSES

    def test_paused_is_terminal(self) -> None:
        assert "paused" in TERMINAL_STATUSES

    def test_running_is_not_terminal(self) -> None:
        assert "running" not in TERMINAL_STATUSES

    def test_enumerating_is_not_terminal(self) -> None:
        assert "enumerating" not in TERMINAL_STATUSES

    def test_pending_is_not_terminal(self) -> None:
        assert "pending" not in TERMINAL_STATUSES

    def test_rolling_back_is_not_terminal(self) -> None:
        assert "rolling_back" not in TERMINAL_STATUSES
