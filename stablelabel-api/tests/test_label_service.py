"""Tests for label service guards — encryption, downgrade, parent detection."""

import pytest

from app.core.exceptions import EncryptionLabelGuardError, LabelDowngradeError
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
