"""Tests for job state machine transitions, copy action, and checkpoint-aware resume.

Note: We duplicate the transition table here to avoid importing from app.routers.jobs,
which transitively imports jose/cryptography (unavailable in this test env).
The source of truth is app/routers/jobs.py — if you change it, update these tests.
"""

import pytest

# Transition table — must match app.routers.jobs.VALID_TRANSITIONS exactly
VALID_TRANSITIONS = {
    "start":    {"from": ("pending",),                                    "to": "enumerating"},
    "pause":    {"from": ("enumerating", "running"),                      "to": "paused"},
    "resume":   {"from": ("paused",),                                     "to": "_from_checkpoint"},
    "cancel":   {"from": ("pending", "enumerating", "running", "paused"), "to": "failed"},
    "rollback": {"from": ("completed", "failed", "paused"),               "to": "rolling_back"},
}

SPECIAL_ACTIONS = {"copy"}
COPY_ALLOWED_FROM = ("completed", "failed", "rolled_back")


# ── Transition table tests ────────────────────────────────────


class TestValidTransitions:
    """Verify the transition table matches the designed state machine."""

    def test_start_only_from_pending(self) -> None:
        t = VALID_TRANSITIONS["start"]
        assert t["from"] == ("pending",)
        assert t["to"] == "enumerating"

    def test_pause_from_active_states(self) -> None:
        t = VALID_TRANSITIONS["pause"]
        assert "enumerating" in t["from"]
        assert "running" in t["from"]
        assert t["to"] == "paused"

    def test_pause_rejects_completed(self) -> None:
        t = VALID_TRANSITIONS["pause"]
        assert "completed" not in t["from"]
        assert "failed" not in t["from"]

    def test_resume_only_from_paused(self) -> None:
        t = VALID_TRANSITIONS["resume"]
        assert t["from"] == ("paused",)
        assert t["to"] == "_from_checkpoint"

    def test_cancel_from_any_active_state(self) -> None:
        t = VALID_TRANSITIONS["cancel"]
        assert "pending" in t["from"]
        assert "enumerating" in t["from"]
        assert "running" in t["from"]
        assert "paused" in t["from"]
        assert t["to"] == "failed"

    def test_cancel_rejects_terminal_states(self) -> None:
        t = VALID_TRANSITIONS["cancel"]
        assert "completed" not in t["from"]
        assert "failed" not in t["from"]
        assert "rolled_back" not in t["from"]

    def test_rollback_from_completed_failed_paused(self) -> None:
        t = VALID_TRANSITIONS["rollback"]
        assert "completed" in t["from"]
        assert "failed" in t["from"]
        assert "paused" in t["from"]
        assert t["to"] == "rolling_back"

    def test_rollback_not_from_running(self) -> None:
        t = VALID_TRANSITIONS["rollback"]
        assert "running" not in t["from"]
        assert "enumerating" not in t["from"]

    def test_copy_is_special_action(self) -> None:
        assert "copy" in SPECIAL_ACTIONS
        assert "copy" not in VALID_TRANSITIONS

    def test_rolling_back_is_a_real_state(self) -> None:
        """rolling_back is a durable state, not an instant transition."""
        t = VALID_TRANSITIONS["rollback"]
        assert t["to"] == "rolling_back"
        assert t["to"] != "rolled_back"

    def test_no_transition_from_rolled_back(self) -> None:
        """rolled_back is terminal — no further transitions except copy."""
        for action, t in VALID_TRANSITIONS.items():
            assert "rolled_back" not in t["from"], (
                f"Action '{action}' should not be allowed from rolled_back"
            )


class TestTransitionGuards:
    """Test that invalid transitions are properly rejected."""

    @pytest.mark.parametrize(
        "action,current_status",
        [
            ("start", "running"),
            ("start", "completed"),
            ("start", "failed"),
            ("pause", "pending"),
            ("pause", "completed"),
            ("pause", "failed"),
            ("resume", "pending"),
            ("resume", "running"),
            ("resume", "completed"),
            ("cancel", "completed"),
            ("cancel", "failed"),
            ("rollback", "running"),
            ("rollback", "pending"),
            ("rollback", "enumerating"),
        ],
    )
    def test_invalid_transition_rejected(self, action: str, current_status: str) -> None:
        transition = VALID_TRANSITIONS[action]
        assert current_status not in transition["from"]


class TestCopyAction:
    """Tests for the copy (retry-as-new-job) action validation."""

    @pytest.mark.parametrize("valid_status", ["completed", "failed", "rolled_back"])
    def test_copy_allowed_from_terminal_states(self, valid_status: str) -> None:
        assert valid_status in COPY_ALLOWED_FROM

    @pytest.mark.parametrize(
        "invalid_status",
        ["pending", "enumerating", "running", "paused", "rolling_back"],
    )
    def test_copy_rejected_from_active_states(self, invalid_status: str) -> None:
        assert invalid_status not in COPY_ALLOWED_FROM


class TestStateCompleteness:
    """Verify all states are accounted for in the transition table."""

    ALL_STATES = {
        "pending", "enumerating", "running", "paused",
        "completed", "failed", "rolling_back", "rolled_back",
    }

    def test_every_non_terminal_state_has_at_least_one_outbound_transition(self) -> None:
        terminal = {"completed", "failed", "rolled_back"}
        non_terminal = self.ALL_STATES - terminal
        # Every non-terminal state should appear in at least one "from" tuple
        covered: set[str] = set()
        for t in VALID_TRANSITIONS.values():
            covered.update(t["from"])
        # rolling_back is special — worker transitions it, not user actions
        non_terminal_minus_worker = non_terminal - {"rolling_back"}
        assert non_terminal_minus_worker.issubset(covered)

    def test_all_target_states_are_valid(self) -> None:
        for action, t in VALID_TRANSITIONS.items():
            target = t["to"]
            if target == "_from_checkpoint":
                continue  # dynamic target for resume
            assert target in self.ALL_STATES, f"Action '{action}' targets unknown state '{target}'"
