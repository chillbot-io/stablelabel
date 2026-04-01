"""Tests for job state machine transitions, copy action, and state completeness.

Imports the real transition table from app.core.job_states (no jose dependency).
"""

import pytest

from app.core.job_states import (
    ALL_STATES,
    COPY_ALLOWED_FROM,
    SPECIAL_ACTIONS,
    VALID_TRANSITIONS,
)


class TestValidTransitions:
    def test_start_only_from_pending(self) -> None:
        t = VALID_TRANSITIONS["start"]
        assert t["from"] == ("pending",)
        assert t["to"] == "enumerating"

    def test_pause_from_active_states(self) -> None:
        t = VALID_TRANSITIONS["pause"]
        assert "enumerating" in t["from"]
        assert "running" in t["from"]
        assert t["to"] == "paused"

    def test_pause_rejects_terminal(self) -> None:
        t = VALID_TRANSITIONS["pause"]
        assert "completed" not in t["from"]
        assert "failed" not in t["from"]

    def test_resume_only_from_paused(self) -> None:
        t = VALID_TRANSITIONS["resume"]
        assert t["from"] == ("paused",)

    def test_cancel_from_any_active_state(self) -> None:
        t = VALID_TRANSITIONS["cancel"]
        for s in ("pending", "enumerating", "running", "paused"):
            assert s in t["from"]
        assert t["to"] == "failed"

    def test_cancel_rejects_terminal_states(self) -> None:
        t = VALID_TRANSITIONS["cancel"]
        for s in ("completed", "failed", "rolled_back"):
            assert s not in t["from"]

    def test_rollback_sources(self) -> None:
        t = VALID_TRANSITIONS["rollback"]
        assert "completed" in t["from"]
        assert "failed" in t["from"]
        assert "paused" in t["from"]
        assert "running" not in t["from"]
        assert t["to"] == "rolling_back"

    def test_no_transition_from_rolled_back(self) -> None:
        for action, t in VALID_TRANSITIONS.items():
            assert "rolled_back" not in t["from"], f"'{action}' should not allow rolled_back"


class TestTransitionGuards:
    @pytest.mark.parametrize("action,status", [
        ("start", "running"), ("start", "completed"),
        ("pause", "pending"), ("pause", "completed"),
        ("resume", "running"), ("resume", "completed"),
        ("cancel", "completed"), ("cancel", "failed"),
        ("rollback", "running"), ("rollback", "pending"),
    ])
    def test_invalid_transition_rejected(self, action: str, status: str) -> None:
        assert status not in VALID_TRANSITIONS[action]["from"]


class TestCopyAction:
    def test_copy_is_special(self) -> None:
        assert "copy" in SPECIAL_ACTIONS
        assert "copy" not in VALID_TRANSITIONS

    @pytest.mark.parametrize("status", ["completed", "failed", "rolled_back"])
    def test_copy_from_terminal(self, status: str) -> None:
        assert status in COPY_ALLOWED_FROM

    @pytest.mark.parametrize("status", ["pending", "enumerating", "running", "paused", "rolling_back"])
    def test_copy_rejected_from_active(self, status: str) -> None:
        assert status not in COPY_ALLOWED_FROM


class TestStateCompleteness:
    def test_non_terminal_states_have_outbound(self) -> None:
        terminal = {"completed", "failed", "rolled_back"}
        covered: set[str] = set()
        for t in VALID_TRANSITIONS.values():
            covered.update(t["from"])
        non_terminal = ALL_STATES - terminal - {"rolling_back"}  # worker-managed
        assert non_terminal.issubset(covered)

    def test_all_targets_are_valid_states(self) -> None:
        for action, t in VALID_TRANSITIONS.items():
            target = t["to"]
            if target == "_from_checkpoint":
                continue
            assert target in ALL_STATES, f"'{action}' targets unknown state '{target}'"
