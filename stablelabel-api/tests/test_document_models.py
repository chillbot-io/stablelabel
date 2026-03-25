"""Tests for new Pydantic models in app.models.document."""

import pytest

from app.models.document import (
    BulkItem,
    BulkRemoveRequest,
    BulkRemoveResponse,
    CsvUploadResult,
    RemoveLabelRequest,
    RemovalMode,
)


class TestRemovalModeEnum:
    def test_removal_mode_values(self) -> None:
        assert RemovalMode.LABEL_ONLY == "label_only"
        assert RemovalMode.ENCRYPTION_ONLY == "encryption_only"
        assert RemovalMode.LABEL_AND_ENCRYPTION == "label_and_encryption"

    def test_removal_mode_is_str(self) -> None:
        assert isinstance(RemovalMode.LABEL_ONLY, str)

    def test_removal_mode_members(self) -> None:
        members = set(RemovalMode)
        assert len(members) == 3


class TestRemoveLabelRequest:
    def test_construction(self) -> None:
        req = RemoveLabelRequest(drive_id="drive-1", item_id="item-1")
        assert req.drive_id == "drive-1"
        assert req.item_id == "item-1"

    def test_requires_fields(self) -> None:
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            RemoveLabelRequest()  # type: ignore[call-arg]


class TestBulkRemoveRequest:
    def test_construction_with_defaults(self) -> None:
        req = BulkRemoveRequest(tenant_id="tenant-1")
        assert req.tenant_id == "tenant-1"
        assert req.items == []
        assert req.mode == RemovalMode.LABEL_ONLY
        assert req.dry_run is False

    def test_construction_with_items(self) -> None:
        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="a.docx"),
            BulkItem(drive_id="d2", item_id="i2", filename="b.xlsx"),
        ]
        req = BulkRemoveRequest(
            tenant_id="tenant-1",
            items=items,
            mode=RemovalMode.LABEL_AND_ENCRYPTION,
            dry_run=True,
        )
        assert len(req.items) == 2
        assert req.mode == RemovalMode.LABEL_AND_ENCRYPTION
        assert req.dry_run is True

    def test_mode_defaults_to_label_only(self) -> None:
        req = BulkRemoveRequest(tenant_id="t1")
        assert req.mode == RemovalMode.LABEL_ONLY


class TestBulkRemoveResponse:
    def test_construction(self) -> None:
        resp = BulkRemoveResponse(
            job_id="job-1",
            tenant_id="tenant-1",
            mode="label_only",
        )
        assert resp.job_id == "job-1"
        assert resp.tenant_id == "tenant-1"
        assert resp.mode == "label_only"
        assert resp.dry_run is False
        assert resp.total == 0
        assert resp.completed == 0
        assert resp.failed == 0
        assert resp.results == []

    def test_construction_with_counts(self) -> None:
        resp = BulkRemoveResponse(
            job_id="job-2",
            tenant_id="tenant-1",
            mode="encryption_only",
            total=10,
            completed=8,
            failed=2,
        )
        assert resp.total == 10
        assert resp.completed == 8
        assert resp.failed == 2


class TestCsvUploadResult:
    def test_construction(self) -> None:
        result = CsvUploadResult(
            total_rows=100,
            valid_rows=95,
            invalid_rows=5,
            errors=["Row 3: missing drive_id", "Row 7: bad item_id"],
        )
        assert result.total_rows == 100
        assert result.valid_rows == 95
        assert result.invalid_rows == 5
        assert len(result.errors) == 2

    def test_construction_defaults(self) -> None:
        result = CsvUploadResult()
        assert result.total_rows == 0
        assert result.valid_rows == 0
        assert result.invalid_rows == 0
        assert result.errors == []
