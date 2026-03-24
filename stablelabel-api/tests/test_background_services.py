"""Tests for background services: label_sync, policy_seeder, sit_catalog."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import StableLabelError
from app.db.models import LabelDefinition, Policy
from app.services.label_sync import (
    _upsert_label_definitions,
    sync_labels_for_all_tenants,
)
from app.services.policy_seeder import UNASSIGNED_LABEL, seed_builtin_policies
from app.services.sit_catalog import SIT_CATALOG, get_sit_by_id, get_sit_catalog


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_label(
    *,
    id: str = "lbl-1",
    name: str = "Public",
    display_name: str = "Public",
    priority: int = 0,
    color: str = "",
    is_active: bool = True,
    has_protection: bool = False,
    applicable_to: list[str] | None = None,
    parent_id: str | None = None,
    is_parent: bool = False,
) -> SimpleNamespace:
    """Lightweight stand-in for SensitivityLabel returned by LabelService."""
    return SimpleNamespace(
        id=id,
        name=name,
        display_name=display_name,
        priority=priority,
        color=color,
        is_active=is_active,
        has_protection=has_protection,
        applicable_to=applicable_to or ["file"],
        parent_id=parent_id,
        is_parent=is_parent,
    )


def _make_tenant(
    *,
    entra_tenant_id: str = "t-aaa",
    display_name: str = "Acme",
    consent_status: str = "active",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        entra_tenant_id=entra_tenant_id,
        display_name=display_name,
        consent_status=consent_status,
    )


def _mock_scalars(rows: list) -> MagicMock:
    """Build a mock Result whose .scalars().all() returns *rows*."""
    scalars = MagicMock()
    scalars.all.return_value = rows
    result = MagicMock()
    result.scalars.return_value = scalars
    return result


def _mock_db(**overrides) -> AsyncMock:
    """Create an AsyncSession mock with db.add as a plain MagicMock."""
    db = AsyncMock()
    db.add = MagicMock()  # add() is sync — avoid coroutine warnings
    for k, v in overrides.items():
        setattr(db, k, v)
    return db


# =========================================================================
# sit_catalog tests
# =========================================================================


class TestSitCatalog:
    def test_get_sit_catalog_returns_full_list(self) -> None:
        catalog = get_sit_catalog()
        assert catalog is SIT_CATALOG
        assert len(catalog) > 0

    def test_get_sit_by_id_known(self) -> None:
        entry = get_sit_by_id("hipaa_phi")
        assert entry is not None
        assert entry["id"] == "hipaa_phi"

    def test_get_sit_by_id_unknown_returns_none(self) -> None:
        assert get_sit_by_id("nonexistent_xyz") is None

    def test_catalog_entries_have_required_fields(self) -> None:
        required = {"id", "name", "description", "category", "rules"}
        for entry in get_sit_catalog():
            missing = required - entry.keys()
            assert not missing, f"Entry {entry.get('id', '?')} missing {missing}"

    def test_catalog_entries_have_valid_rule_structure(self) -> None:
        for entry in get_sit_catalog():
            rules = entry["rules"]
            assert "patterns" in rules, f"{entry['id']} missing patterns"
            assert isinstance(rules["patterns"], list)
            assert len(rules["patterns"]) > 0, f"{entry['id']} has empty patterns"
            for pattern in rules["patterns"]:
                assert "confidence_level" in pattern
                assert "primary_match" in pattern
                pm = pattern["primary_match"]
                assert "type" in pm
                assert pm["type"] in ("entity", "regex")

    def test_all_ids_are_unique(self) -> None:
        ids = [e["id"] for e in get_sit_catalog()]
        assert len(ids) == len(set(ids))


# =========================================================================
# label_sync tests
# =========================================================================


class TestSyncLabelsForAllTenants:
    @pytest.mark.asyncio
    async def test_syncs_active_tenants_returns_stats(self) -> None:
        tenant = _make_tenant()
        labels = [_make_label(id="l1"), _make_label(id="l2")]

        db = _mock_db()
        db.execute.return_value = _mock_scalars([tenant])
        db.commit = AsyncMock()

        label_service = AsyncMock()
        label_service.get_labels = AsyncMock(return_value=labels)

        with patch(
            "app.services.label_sync._upsert_label_definitions", new_callable=AsyncMock
        ) as mock_upsert:
            summary = await sync_labels_for_all_tenants(db, label_service)

        assert summary == {"synced": 1, "failed": 0, "skipped": 0}
        label_service.get_labels.assert_awaited_once_with(
            tenant.entra_tenant_id, force=True
        )
        mock_upsert.assert_awaited_once_with(db, tenant.id, labels)

    @pytest.mark.asyncio
    async def test_handles_tenant_error_without_crashing(self) -> None:
        t1 = _make_tenant(entra_tenant_id="t-ok")
        t2 = _make_tenant(entra_tenant_id="t-fail")
        t3 = _make_tenant(entra_tenant_id="t-ok2")

        db = _mock_db()
        db.execute.return_value = _mock_scalars([t1, t2, t3])
        db.commit = AsyncMock()

        async def _get_labels(tid: str, *, force: bool = False):
            if tid == "t-fail":
                raise StableLabelError("Graph API unavailable")
            return [_make_label()]

        label_service = AsyncMock()
        label_service.get_labels = AsyncMock(side_effect=_get_labels)

        with patch(
            "app.services.label_sync._upsert_label_definitions", new_callable=AsyncMock
        ):
            summary = await sync_labels_for_all_tenants(db, label_service)

        assert summary["synced"] == 2
        assert summary["failed"] == 1

    @pytest.mark.asyncio
    async def test_no_active_tenants_returns_zeros(self) -> None:
        db = _mock_db()
        db.execute.return_value = _mock_scalars([])

        label_service = AsyncMock()

        summary = await sync_labels_for_all_tenants(db, label_service)

        assert summary == {"synced": 0, "failed": 0, "skipped": 0}
        label_service.get_labels.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_tenant_with_no_labels_syncs_successfully(self) -> None:
        tenant = _make_tenant()

        db = _mock_db()
        db.execute.return_value = _mock_scalars([tenant])
        db.commit = AsyncMock()

        label_service = AsyncMock()
        label_service.get_labels = AsyncMock(return_value=[])

        with patch(
            "app.services.label_sync._upsert_label_definitions", new_callable=AsyncMock
        ) as mock_upsert:
            summary = await sync_labels_for_all_tenants(db, label_service)

        assert summary["synced"] == 1
        assert summary["failed"] == 0
        mock_upsert.assert_awaited_once_with(db, tenant.id, [])


class TestUpsertLabelDefinitions:
    @pytest.mark.asyncio
    async def test_inserts_new_labels(self) -> None:
        ct_id = uuid.uuid4()
        labels = [_make_label(id="new-1", name="Confidential")]

        db = _mock_db()
        # Return empty existing set
        db.execute.return_value = _mock_scalars([])
        db.commit = AsyncMock()

        await _upsert_label_definitions(db, ct_id, labels)

        db.add.assert_called_once()
        added: LabelDefinition = db.add.call_args[0][0]
        assert added.graph_label_id == "new-1"
        assert added.name == "Confidential"
        assert added.customer_tenant_id == ct_id
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_updates_existing_label(self) -> None:
        ct_id = uuid.uuid4()
        existing_ld = MagicMock(spec=LabelDefinition)
        existing_ld.graph_label_id = "existing-1"

        db = _mock_db()
        db.execute.return_value = _mock_scalars([existing_ld])
        db.commit = AsyncMock()

        updated_label = _make_label(
            id="existing-1",
            name="Updated Name",
            display_name="Updated Display",
            priority=5,
        )

        await _upsert_label_definitions(db, ct_id, [updated_label])

        assert existing_ld.name == "Updated Name"
        assert existing_ld.display_name == "Updated Display"
        assert existing_ld.priority == 5
        # Should NOT call db.add for updates
        db.add.assert_not_called()
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_marks_removed_labels_inactive(self) -> None:
        ct_id = uuid.uuid4()
        old_ld = MagicMock(spec=LabelDefinition)
        old_ld.graph_label_id = "gone-1"
        old_ld.is_active = True

        db = _mock_db()
        db.execute.return_value = _mock_scalars([old_ld])
        db.commit = AsyncMock()

        # Sync with empty list — old_ld should be marked inactive
        await _upsert_label_definitions(db, ct_id, [])

        assert old_ld.is_active is False
        assert old_ld.fetched_at is not None

    @pytest.mark.asyncio
    async def test_empty_labels_with_no_existing_is_noop(self) -> None:
        db = _mock_db()
        db.execute.return_value = _mock_scalars([])
        db.commit = AsyncMock()

        await _upsert_label_definitions(db, uuid.uuid4(), [])

        db.add.assert_not_called()
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_commit_failure_rolls_back(self) -> None:
        db = _mock_db()
        db.execute.return_value = _mock_scalars([])
        db.commit = AsyncMock(side_effect=Exception("DB down"))
        db.rollback = AsyncMock()

        with pytest.raises(Exception, match="DB down"):
            await _upsert_label_definitions(db, uuid.uuid4(), [_make_label()])

        db.rollback.assert_awaited_once()


# =========================================================================
# policy_seeder tests
# =========================================================================


class TestSeedBuiltinPolicies:
    @pytest.mark.asyncio
    async def test_creates_one_policy_per_catalog_entry(self) -> None:
        ct_id = uuid.uuid4()
        db = _mock_db()

        policies = await seed_builtin_policies(ct_id, db)

        catalog = get_sit_catalog()
        assert len(policies) == len(catalog)
        assert db.add.call_count == len(catalog)

    @pytest.mark.asyncio
    async def test_policies_created_disabled(self) -> None:
        db = _mock_db()
        policies = await seed_builtin_policies(uuid.uuid4(), db)

        for p in policies:
            assert p.is_enabled is False

    @pytest.mark.asyncio
    async def test_policies_are_builtin(self) -> None:
        db = _mock_db()
        policies = await seed_builtin_policies(uuid.uuid4(), db)

        for p in policies:
            assert p.is_builtin is True

    @pytest.mark.asyncio
    async def test_uses_unassigned_label_sentinel(self) -> None:
        db = _mock_db()
        policies = await seed_builtin_policies(uuid.uuid4(), db)

        for p in policies:
            assert p.target_label_id == UNASSIGNED_LABEL
            assert p.target_label_id == "__unassigned__"

    @pytest.mark.asyncio
    async def test_policy_names_match_catalog(self) -> None:
        db = _mock_db()
        policies = await seed_builtin_policies(uuid.uuid4(), db)

        catalog = get_sit_catalog()
        expected_names = {sit["name"] for sit in catalog}
        actual_names = {p.name for p in policies}
        assert actual_names == expected_names

    @pytest.mark.asyncio
    async def test_policy_rules_match_catalog(self) -> None:
        db = _mock_db()
        policies = await seed_builtin_policies(uuid.uuid4(), db)

        catalog = get_sit_catalog()
        catalog_rules = {sit["name"]: sit["rules"] for sit in catalog}
        for p in policies:
            assert p.rules == catalog_rules[p.name]

    @pytest.mark.asyncio
    async def test_priorities_are_descending(self) -> None:
        db = _mock_db()
        policies = await seed_builtin_policies(uuid.uuid4(), db)

        priorities = [p.priority for p in policies]
        assert priorities == sorted(priorities, reverse=True)

    @pytest.mark.asyncio
    async def test_idempotent_no_duplicates(self) -> None:
        """Calling seed twice produces independent policy objects — caller
        is expected to guard against double-seeding via DB constraints or
        pre-check.  Here we verify the function itself is deterministic."""
        ct_id = uuid.uuid4()
        db = _mock_db()

        first = await seed_builtin_policies(ct_id, db)
        second = await seed_builtin_policies(ct_id, db)

        first_names = [p.name for p in first]
        second_names = [p.name for p in second]
        assert first_names == second_names

    @pytest.mark.asyncio
    async def test_customer_tenant_id_is_set(self) -> None:
        ct_id = uuid.uuid4()
        db = _mock_db()
        policies = await seed_builtin_policies(ct_id, db)

        for p in policies:
            assert p.customer_tenant_id == ct_id
