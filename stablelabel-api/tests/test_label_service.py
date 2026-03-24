"""Tests for label service guards — encryption, downgrade, parent detection."""

import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.exceptions import EncryptionLabelGuardError, LabelDowngradeError, LabelNotFoundError
from app.models.label import SensitivityLabel
from app.services.label_service import LabelService


def _make_label(
    *,
    id: str = "test-id",
    name: str = "Test",
    priority: int = 0,
    has_protection: bool = False,
    is_parent: bool = False,
) -> SensitivityLabel:
    return SensitivityLabel(
        id=id,
        name=name,
        display_name=name,
        priority=priority,
        has_protection=has_protection,
        is_parent=is_parent,
        applicable_to=["file"],
        is_active=True,
    )


class TestEncryptionGuard:
    def test_blocks_unconfirmed_encryption_label(self) -> None:
        svc = LabelService.__new__(LabelService)
        label = _make_label(has_protection=True, name="Highly Confidential")
        with pytest.raises(EncryptionLabelGuardError, match="encryption/protection"):
            svc.check_encryption_guard(label, confirmed=False)

    def test_allows_confirmed_encryption_label(self) -> None:
        svc = LabelService.__new__(LabelService)
        label = _make_label(has_protection=True)
        svc.check_encryption_guard(label, confirmed=True)  # should not raise

    def test_allows_metadata_only_label(self) -> None:
        svc = LabelService.__new__(LabelService)
        label = _make_label(has_protection=False)
        svc.check_encryption_guard(label, confirmed=False)  # should not raise


class TestDowngradeCheck:
    def test_blocks_downgrade_without_justification(self) -> None:
        svc = LabelService.__new__(LabelService)
        current = _make_label(id="high", name="Confidential", priority=5)
        target = _make_label(id="low", name="General", priority=1)
        with pytest.raises(LabelDowngradeError, match="justification"):
            svc.check_downgrade(current, target)

    def test_allows_downgrade_with_justification(self) -> None:
        svc = LabelService.__new__(LabelService)
        current = _make_label(priority=5)
        target = _make_label(priority=1)
        svc.check_downgrade(current, target, justification="Business need")

    def test_allows_downgrade_with_privileged(self) -> None:
        svc = LabelService.__new__(LabelService)
        current = _make_label(priority=5)
        target = _make_label(priority=1)
        svc.check_downgrade(current, target, assignment_method="privileged")

    def test_allows_upgrade(self) -> None:
        svc = LabelService.__new__(LabelService)
        current = _make_label(priority=1)
        target = _make_label(priority=5)
        svc.check_downgrade(current, target)  # should not raise

    def test_allows_no_current_label(self) -> None:
        svc = LabelService.__new__(LabelService)
        target = _make_label(priority=5)
        svc.check_downgrade(None, target)  # should not raise


class TestParentDetection:
    def test_marks_parents(self) -> None:
        parent = _make_label(id="parent-1", name="Confidential")
        child = _make_label(id="child-1", name="Confidential/Internal")
        child.parent_id = "parent-1"

        LabelService._mark_parents([parent, child])

        assert parent.is_parent is True
        assert child.is_parent is False


# ── Helpers for new tests ────────────────────────────────────────

def _mock_settings(ttl: float = 1800.0) -> SimpleNamespace:
    return SimpleNamespace(label_cache_ttl=ttl)


def _raw_label(
    *,
    id: str = "lbl-1",
    name: str = "General",
    displayName: str = "General",
    description: str = "",
    priority: int = 0,
    color: str = "",
    isEnabled: bool = True,
    hasProtection: bool = False,
    applicableTo: str = "file",
    parent: dict | None = None,
) -> dict:
    raw: dict = {
        "id": id,
        "name": name,
        "displayName": displayName,
        "description": description,
        "priority": priority,
        "color": color,
        "isEnabled": isEnabled,
        "hasProtection": hasProtection,
        "applicableTo": applicableTo,
    }
    if parent is not None:
        raw["parent"] = parent
    return raw


# ── Constructor ──────────────────────────────────────────────────

class TestInit:
    def test_constructor_stores_graph_and_settings(self) -> None:
        graph = AsyncMock()
        settings = _mock_settings(ttl=600.0)
        svc = LabelService(graph, settings)

        assert svc._graph is graph
        assert svc._caches == {}
        assert svc._label_cache_ttl == 600.0


# ── get_labels ───────────────────────────────────────────────────

class TestGetLabels:
    @pytest.mark.asyncio
    async def test_fetches_from_graph_and_caches(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [_raw_label(id="a"), _raw_label(id="b")]
        svc = LabelService(graph, _mock_settings())

        labels = await svc.get_labels("tenant-1")

        assert len(labels) == 2
        assert labels[0].id == "a"
        assert labels[1].id == "b"
        graph.get_all_pages.assert_awaited_once()
        # Cache should now be populated
        assert "tenant-1" in svc._caches

    @pytest.mark.asyncio
    async def test_returns_cached_on_second_call(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [_raw_label()]
        svc = LabelService(graph, _mock_settings())

        first = await svc.get_labels("t1")
        second = await svc.get_labels("t1")

        assert first == second
        assert graph.get_all_pages.await_count == 1  # only one Graph call

    @pytest.mark.asyncio
    async def test_force_bypasses_cache(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [_raw_label()]
        svc = LabelService(graph, _mock_settings())

        await svc.get_labels("t1")
        await svc.get_labels("t1", force=True)

        assert graph.get_all_pages.await_count == 2

    @pytest.mark.asyncio
    async def test_stale_cache_triggers_refresh(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [_raw_label()]
        svc = LabelService(graph, _mock_settings(ttl=0.0))  # instant staleness

        await svc.get_labels("t1")
        await svc.get_labels("t1")

        assert graph.get_all_pages.await_count == 2


# ── get_label ────────────────────────────────────────────────────

class TestGetLabel:
    @pytest.mark.asyncio
    async def test_returns_matching_active_label(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [
            _raw_label(id="lbl-1", name="General"),
            _raw_label(id="lbl-2", name="Confidential"),
        ]
        svc = LabelService(graph, _mock_settings())

        label = await svc.get_label("t1", "lbl-2")
        assert label.id == "lbl-2"
        assert label.name == "Confidential"

    @pytest.mark.asyncio
    async def test_raises_for_missing_label(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [_raw_label(id="lbl-1")]
        svc = LabelService(graph, _mock_settings())

        with pytest.raises(LabelNotFoundError, match="not found"):
            await svc.get_label("t1", "nonexistent")

    @pytest.mark.asyncio
    async def test_raises_for_disabled_label(self) -> None:
        graph = AsyncMock()
        graph.get_all_pages.return_value = [
            _raw_label(id="lbl-disabled", isEnabled=False),
        ]
        svc = LabelService(graph, _mock_settings())

        with pytest.raises(LabelNotFoundError, match="disabled"):
            await svc.get_label("t1", "lbl-disabled")


# ── get_appliable_labels ─────────────────────────────────────────

class TestGetAppliableLabels:
    @pytest.mark.asyncio
    async def test_filters_correctly(self) -> None:
        parent_raw = _raw_label(id="parent", applicableTo="file")
        child_raw = _raw_label(id="child", applicableTo="file", parent={"id": "parent"})
        inactive_raw = _raw_label(id="inactive", isEnabled=False, applicableTo="file")
        email_only_raw = _raw_label(id="email-only", applicableTo="email")
        good_raw = _raw_label(id="good", applicableTo="file,email")

        graph = AsyncMock()
        graph.get_all_pages.return_value = [
            parent_raw, child_raw, inactive_raw, email_only_raw, good_raw,
        ]
        svc = LabelService(graph, _mock_settings())

        appliable = await svc.get_appliable_labels("t1")
        ids = [lb.id for lb in appliable]

        # parent is marked as parent (has child) -> excluded
        # child is active, not parent, file-scoped -> included
        # inactive -> excluded
        # email-only -> excluded (no "file")
        # good -> included (has "file")
        assert "child" in ids
        assert "good" in ids
        assert "parent" not in ids
        assert "inactive" not in ids
        assert "email-only" not in ids


# ── _parse_label ─────────────────────────────────────────────────

class TestParseLabel:
    def test_full_graph_response(self) -> None:
        raw = _raw_label(
            id="abc-123",
            name="Confidential",
            displayName="Confidential Display",
            description="Top secret",
            priority=5,
            color="#FF0000",
            isEnabled=True,
            hasProtection=True,
            applicableTo="file, email, site",
            parent={"id": "parent-99"},
        )
        label = LabelService._parse_label(raw)

        assert label.id == "abc-123"
        assert label.name == "Confidential"
        assert label.display_name == "Confidential Display"
        assert label.description == "Top secret"
        assert label.priority == 5
        assert label.color == "#FF0000"
        assert label.is_active is True
        assert label.has_protection is True
        assert label.applicable_to == ["file", "email", "site"]
        assert label.parent_id == "parent-99"

    def test_minimal_response_uses_defaults(self) -> None:
        label = LabelService._parse_label({})

        assert label.id == ""
        assert label.name == ""
        assert label.display_name == ""
        assert label.priority == 0
        assert label.color == ""
        assert label.is_active is True
        assert label.has_protection is False
        assert label.applicable_to == []
        assert label.parent_id is None

    def test_no_parent_field(self) -> None:
        raw = _raw_label()  # no parent kwarg -> no "parent" key
        label = LabelService._parse_label(raw)
        assert label.parent_id is None

    def test_parent_with_id(self) -> None:
        raw = _raw_label(parent={"id": "p-1"})
        label = LabelService._parse_label(raw)
        assert label.parent_id == "p-1"

    def test_displayName_falls_back_to_name(self) -> None:
        raw = {"name": "FallbackName"}
        label = LabelService._parse_label(raw)
        assert label.display_name == "FallbackName"
