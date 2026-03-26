"""Tests for SIT-catalog endpoints, from-sit policy creation, built-in policy
restrictions, and job_states module.

Router tests use the same testcontainers infrastructure as
test_api_integration.py (fixtures from conftest.py).
"""

from __future__ import annotations

import uuid
from typing import AsyncIterator

import httpx
import pytest

from app.core.job_states import (
    ALL_STATES,
    COPY_ALLOWED_FROM,
    SSE_STOP_STATUSES,
    TERMINAL_STATUSES,
    VALID_TRANSITIONS,
)
from app.services.sit_catalog import SIT_CATALOG, get_sit_by_id, get_sit_catalog
from tests.conftest import (
    CUSTOMER_TENANT_ID,
    OPERATOR_USER,
    VIEWER_USER,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)


# ---------------------------------------------------------------------------
# Fixtures — operator/viewer clients that also mount sit_router
# ---------------------------------------------------------------------------


def _build_app_with_sit(current_user, session):
    """Build an app that includes both policies.router AND policies.sit_router."""
    from app.routers import policies

    app = _build_app(current_user, session)
    app.include_router(policies.sit_router)
    return app


@pytest.fixture()
async def operator_sit_client(db_session) -> AsyncIterator[httpx.AsyncClient]:
    app = _build_app_with_sit(OPERATOR_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def viewer_sit_client(db_session) -> AsyncIterator[httpx.AsyncClient]:
    app = _build_app_with_sit(VIEWER_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ===================================================================
# Part 1: SIT Catalog endpoint tests
# ===================================================================


class TestSitCatalogEndpoints:
    """GET /sit-catalog and GET /sit-catalog/{sit_id}."""

    @pytest.mark.asyncio
    async def test_list_sit_catalog(self, viewer_sit_client: httpx.AsyncClient):
        resp = await viewer_sit_client.get("/sit-catalog")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == len(SIT_CATALOG)
        # Every entry has required keys
        for entry in data:
            assert "id" in entry
            assert "name" in entry
            assert "rules" in entry

    @pytest.mark.asyncio
    async def test_get_sit_definition_known_id(self, viewer_sit_client: httpx.AsyncClient):
        resp = await viewer_sit_client.get("/sit-catalog/hipaa_phi")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "hipaa_phi"
        assert data["category"] == "Healthcare"
        assert "patterns" in data["rules"]

    @pytest.mark.asyncio
    async def test_get_sit_definition_pci(self, viewer_sit_client: httpx.AsyncClient):
        resp = await viewer_sit_client.get("/sit-catalog/pci_dss")
        assert resp.status_code == 200
        assert resp.json()["id"] == "pci_dss"

    @pytest.mark.asyncio
    async def test_get_sit_definition_unknown_returns_404(
        self, viewer_sit_client: httpx.AsyncClient
    ):
        resp = await viewer_sit_client.get("/sit-catalog/nonexistent_sit")
        assert resp.status_code == 404
        assert "nonexistent_sit" in resp.json()["detail"]


# ===================================================================
# Part 2: POST /tenants/{id}/policies/from-sit
# ===================================================================


class TestCreatePolicyFromSit:
    """POST /tenants/{id}/policies/from-sit — create from SIT catalog entry."""

    @pytest.mark.asyncio
    async def test_create_from_sit_happy_path(
        self, operator_sit_client: httpx.AsyncClient
    ):
        payload = {
            "sit_id": "hipaa_phi",
            "target_label_id": "label-hipaa",
        }
        resp = await operator_sit_client.post(
            f"/tenants/{CT}/policies/from-sit", json=payload
        )
        assert resp.status_code == 201
        data = resp.json()
        # Name defaults to the SIT catalog name
        assert data["name"] == "HIPAA — Protected Health Information (PHI)"
        assert data["target_label_id"] == "label-hipaa"
        assert data["is_builtin"] is False
        assert data["is_enabled"] is True
        assert "patterns" in data["rules"]
        assert data["schema_version"] == "sit"

    @pytest.mark.asyncio
    async def test_create_from_sit_custom_name(
        self, operator_sit_client: httpx.AsyncClient
    ):
        payload = {
            "sit_id": "pci_dss",
            "target_label_id": "label-pci",
            "name": "My PCI Policy",
            "priority": 50,
            "is_enabled": False,
        }
        resp = await operator_sit_client.post(
            f"/tenants/{CT}/policies/from-sit", json=payload
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My PCI Policy"
        assert data["priority"] == 50
        assert data["is_enabled"] is False

    @pytest.mark.asyncio
    async def test_create_from_sit_invalid_sit_id(
        self, operator_sit_client: httpx.AsyncClient
    ):
        payload = {
            "sit_id": "does_not_exist",
            "target_label_id": "label-x",
        }
        resp = await operator_sit_client.post(
            f"/tenants/{CT}/policies/from-sit", json=payload
        )
        assert resp.status_code == 404
        assert "does_not_exist" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_from_sit_rules_match_catalog(
        self, operator_sit_client: httpx.AsyncClient
    ):
        """The created policy's rules should match the catalog entry exactly."""
        sit_entry = get_sit_by_id("credentials")
        assert sit_entry is not None

        payload = {
            "sit_id": "credentials",
            "target_label_id": "label-creds",
        }
        resp = await operator_sit_client.post(
            f"/tenants/{CT}/policies/from-sit", json=payload
        )
        assert resp.status_code == 201
        assert resp.json()["rules"] == sit_entry["rules"]


# ===================================================================
# Part 3: Built-in policy update restrictions
# ===================================================================


class TestBuiltinPolicyRestrictions:
    """Built-in policies: only is_enabled can be changed."""

    async def _create_builtin_policy(self, db_session) -> str:
        """Insert a built-in policy directly via the DB and return its ID."""
        from app.db.models import Policy

        policy = Policy(
            customer_tenant_id=CUSTOMER_TENANT_ID,
            name="Built-in HIPAA",
            rules={"patterns": []},
            target_label_id="label-builtin",
            priority=100,
            is_enabled=True,
            is_builtin=True,
        )
        db_session.add(policy)
        await db_session.flush()
        return str(policy.id)

    @pytest.fixture()
    async def builtin_client_and_id(self, db_session):
        """Return (client, builtin_policy_id)."""
        policy_id = await self._create_builtin_policy(db_session)
        app = _build_app_with_sit(OPERATOR_USER, db_session)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c, policy_id

    @pytest.mark.asyncio
    async def test_builtin_toggle_enabled_allowed(self, builtin_client_and_id):
        client, policy_id = builtin_client_and_id
        resp = await client.patch(
            f"/tenants/{CT}/policies/{policy_id}",
            json={"is_enabled": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_enabled"] is False

    @pytest.mark.asyncio
    async def test_builtin_update_name_rejected(self, builtin_client_and_id):
        client, policy_id = builtin_client_and_id
        resp = await client.patch(
            f"/tenants/{CT}/policies/{policy_id}",
            json={"name": "Hacked name"},
        )
        assert resp.status_code == 400
        assert "Built-in" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_builtin_update_rules_rejected(self, builtin_client_and_id):
        client, policy_id = builtin_client_and_id
        resp = await client.patch(
            f"/tenants/{CT}/policies/{policy_id}",
            json={"rules": {"patterns": [{"confidence_level": 99}]}},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_builtin_update_priority_rejected(self, builtin_client_and_id):
        client, policy_id = builtin_client_and_id
        resp = await client.patch(
            f"/tenants/{CT}/policies/{policy_id}",
            json={"priority": 999},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_builtin_update_target_label_rejected(self, builtin_client_and_id):
        client, policy_id = builtin_client_and_id
        resp = await client.patch(
            f"/tenants/{CT}/policies/{policy_id}",
            json={"target_label_id": "different-label"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_builtin_delete_rejected(self, builtin_client_and_id):
        client, policy_id = builtin_client_and_id
        resp = await client.delete(f"/tenants/{CT}/policies/{policy_id}")
        assert resp.status_code == 400
        assert "disable instead" in resp.json()["detail"]


# ===================================================================
# Part 4: job_states.py — pure unit tests (no DB, no async)
# ===================================================================


class TestValidTransitions:
    """Every action in VALID_TRANSITIONS with its from/to states."""

    def test_start_from_pending_to_enumerating(self):
        t = VALID_TRANSITIONS["start"]
        assert "pending" in t["from"]
        assert t["to"] == "enumerating"

    def test_start_only_from_pending(self):
        assert VALID_TRANSITIONS["start"]["from"] == ("pending",)

    def test_pause_from_enumerating(self):
        assert "enumerating" in VALID_TRANSITIONS["pause"]["from"]

    def test_pause_from_running(self):
        assert "running" in VALID_TRANSITIONS["pause"]["from"]

    def test_pause_to_paused(self):
        assert VALID_TRANSITIONS["pause"]["to"] == "paused"

    def test_resume_from_paused(self):
        t = VALID_TRANSITIONS["resume"]
        assert t["from"] == ("paused",)
        assert t["to"] == "_from_checkpoint"

    def test_cancel_from_states(self):
        expected = {"pending", "enumerating", "running", "paused"}
        actual = set(VALID_TRANSITIONS["cancel"]["from"])
        assert actual == expected

    def test_cancel_to_failed(self):
        assert VALID_TRANSITIONS["cancel"]["to"] == "failed"

    def test_rollback_from_states(self):
        expected = {"completed", "failed", "paused"}
        actual = set(VALID_TRANSITIONS["rollback"]["from"])
        assert actual == expected

    def test_rollback_to_rolling_back(self):
        assert VALID_TRANSITIONS["rollback"]["to"] == "rolling_back"

    def test_all_actions_present(self):
        assert set(VALID_TRANSITIONS.keys()) == {
            "start", "pause", "resume", "cancel", "rollback"
        }


class TestInvalidTransitions:
    """Verify that certain state transitions are NOT allowed."""

    def _is_valid_transition(self, action: str, from_state: str) -> bool:
        if action not in VALID_TRANSITIONS:
            return False
        return from_state in VALID_TRANSITIONS[action]["from"]

    def test_start_from_running_invalid(self):
        assert not self._is_valid_transition("start", "running")

    def test_start_from_completed_invalid(self):
        assert not self._is_valid_transition("start", "completed")

    def test_start_from_failed_invalid(self):
        assert not self._is_valid_transition("start", "failed")

    def test_pause_from_completed_invalid(self):
        assert not self._is_valid_transition("pause", "completed")

    def test_pause_from_pending_invalid(self):
        assert not self._is_valid_transition("pause", "pending")

    def test_pause_from_paused_invalid(self):
        assert not self._is_valid_transition("pause", "paused")

    def test_resume_from_running_invalid(self):
        assert not self._is_valid_transition("resume", "running")

    def test_resume_from_pending_invalid(self):
        assert not self._is_valid_transition("resume", "pending")

    def test_cancel_from_completed_invalid(self):
        assert not self._is_valid_transition("cancel", "completed")

    def test_cancel_from_rolled_back_invalid(self):
        assert not self._is_valid_transition("cancel", "rolled_back")

    def test_rollback_from_pending_invalid(self):
        assert not self._is_valid_transition("rollback", "pending")

    def test_rollback_from_running_invalid(self):
        assert not self._is_valid_transition("rollback", "running")

    def test_rollback_from_enumerating_invalid(self):
        assert not self._is_valid_transition("rollback", "enumerating")


class TestCopyAllowedFrom:
    """COPY_ALLOWED_FROM — which terminal/near-terminal states allow copy."""

    def test_completed_allows_copy(self):
        assert "completed" in COPY_ALLOWED_FROM

    def test_failed_allows_copy(self):
        assert "failed" in COPY_ALLOWED_FROM

    def test_rolled_back_allows_copy(self):
        assert "rolled_back" in COPY_ALLOWED_FROM

    def test_running_disallows_copy(self):
        assert "running" not in COPY_ALLOWED_FROM

    def test_pending_disallows_copy(self):
        assert "pending" not in COPY_ALLOWED_FROM

    def test_paused_disallows_copy(self):
        assert "paused" not in COPY_ALLOWED_FROM

    def test_enumerating_disallows_copy(self):
        assert "enumerating" not in COPY_ALLOWED_FROM

    def test_exact_membership(self):
        assert set(COPY_ALLOWED_FROM) == {"completed", "failed", "rolled_back"}


class TestTerminalStatuses:
    """TERMINAL_STATUSES — frozenset of final job states."""

    def test_completed_is_terminal(self):
        assert "completed" in TERMINAL_STATUSES

    def test_failed_is_terminal(self):
        assert "failed" in TERMINAL_STATUSES

    def test_rolled_back_is_terminal(self):
        assert "rolled_back" in TERMINAL_STATUSES

    def test_running_not_terminal(self):
        assert "running" not in TERMINAL_STATUSES

    def test_paused_not_terminal(self):
        assert "paused" not in TERMINAL_STATUSES

    def test_exact_membership(self):
        assert TERMINAL_STATUSES == {"completed", "failed", "rolled_back"}

    def test_is_frozenset(self):
        assert isinstance(TERMINAL_STATUSES, frozenset)


class TestSseStopStatuses:
    """SSE_STOP_STATUSES — terminal states plus paused."""

    def test_includes_all_terminal(self):
        assert TERMINAL_STATUSES.issubset(SSE_STOP_STATUSES)

    def test_includes_paused(self):
        assert "paused" in SSE_STOP_STATUSES

    def test_running_not_included(self):
        assert "running" not in SSE_STOP_STATUSES

    def test_pending_not_included(self):
        assert "pending" not in SSE_STOP_STATUSES

    def test_exact_membership(self):
        assert SSE_STOP_STATUSES == {"completed", "failed", "rolled_back", "paused"}


class TestResumeLogic:
    """Resume target is _from_checkpoint — meaning the caller must resolve it
    based on the checkpoint type (enumerating vs running)."""

    def test_resume_target_is_checkpoint_sentinel(self):
        assert VALID_TRANSITIONS["resume"]["to"] == "_from_checkpoint"

    def test_resume_only_from_paused(self):
        assert VALID_TRANSITIONS["resume"]["from"] == ("paused",)

    def test_checkpoint_target_not_a_real_state(self):
        """_from_checkpoint is a sentinel, not a member of ALL_STATES."""
        assert "_from_checkpoint" not in ALL_STATES


class TestAllStates:
    """ALL_STATES should contain every state referenced in the transition table."""

    def test_all_from_states_in_all_states(self):
        for action, spec in VALID_TRANSITIONS.items():
            for state in spec["from"]:
                assert state in ALL_STATES, f"{state} (from {action}) missing"

    def test_real_to_states_in_all_states(self):
        for action, spec in VALID_TRANSITIONS.items():
            target = spec["to"]
            if not target.startswith("_"):
                assert target in ALL_STATES, f"{target} (to of {action}) missing"

    def test_terminal_statuses_subset(self):
        assert TERMINAL_STATUSES.issubset(ALL_STATES)

    def test_expected_count(self):
        assert len(ALL_STATES) == 8
