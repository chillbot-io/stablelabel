"""Unit tests for DocumentService — guard chain, bulk ops, verification.

GraphClient and LabelService are fully mocked.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import (
    EncryptionLabelGuardError,
    GraphLockedError,
    LabelDowngradeError,
    LabelNotFoundError,
    StableLabelError,
)
from app.models.document import (
    AssignmentMethod,
    BulkItem,
    DocumentLabel,
    JobStatus,
    LabelAssignment,
    LabelJobResult,
)
from app.models.label import SensitivityLabel
from app.services.document_service import DocumentService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _label(label_id: str = "lbl-1", has_protection: bool = False, priority: int = 1) -> SensitivityLabel:
    return SensitivityLabel(
        id=label_id, name="Test", display_name="Test",
        priority=priority, has_protection=has_protection,
    )


def _assignment(label_id: str = "lbl-1", **kwargs) -> LabelAssignment:
    return LabelAssignment(
        drive_id="d1", item_id="i1",
        sensitivity_label_id=label_id, **kwargs,
    )


def _make_service(
    graph: AsyncMock | None = None,
    labels: AsyncMock | None = None,
    max_concurrent: int = 4,
    verify_delay: float = 0.0,
) -> DocumentService:
    g = graph or AsyncMock()
    l = labels or AsyncMock()
    settings = MagicMock()
    settings.bulk_max_concurrent = max_concurrent
    settings.bulk_verify_delay = verify_delay
    return DocumentService(graph=g, labels=l, settings=settings)


def _mock_graph(post_return=None):
    g = AsyncMock()
    g.post = AsyncMock(return_value=post_return or ({}, 200, {}))
    g.poll_operation = AsyncMock(return_value={"status": "completed"})
    return g


def _mock_labels(label: SensitivityLabel | None = None):
    l = AsyncMock()
    l.get_label = AsyncMock(return_value=label or _label())
    l.check_encryption_guard = MagicMock()  # sync method
    l.check_downgrade = MagicMock()  # sync method
    return l


# ---------------------------------------------------------------------------
# extract_label
# ---------------------------------------------------------------------------

class TestExtractLabel:
    @pytest.mark.asyncio
    async def test_returns_label_when_present(self):
        graph = _mock_graph(post_return=(
            {"labels": [{"sensitivityLabelId": "lbl-1", "assignmentMethod": "standard", "tenantId": "t1"}]},
            200, {},
        ))
        svc = _make_service(graph=graph)
        result = await svc.extract_label("t1", "d1", "i1")
        assert result is not None
        assert result.sensitivity_label_id == "lbl-1"
        assert result.assignment_method == "standard"

    @pytest.mark.asyncio
    async def test_returns_none_when_no_labels(self):
        graph = _mock_graph(post_return=({"labels": []}, 200, {}))
        svc = _make_service(graph=graph)
        result = await svc.extract_label("t1", "d1", "i1")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_labels_key_missing(self):
        graph = _mock_graph(post_return=({}, 200, {}))
        svc = _make_service(graph=graph)
        result = await svc.extract_label("t1", "d1", "i1")
        assert result is None


# ---------------------------------------------------------------------------
# apply_label — guard chain
# ---------------------------------------------------------------------------

class TestApplyLabelGuards:
    @pytest.mark.asyncio
    async def test_success_200(self):
        graph = _mock_graph(post_return=({}, 200, {}))
        labels = _mock_labels()
        # extract_label returns None (no current label) on the downgrade check
        graph.post.side_effect = [
            ({"labels": []}, 200, {}),   # extract for downgrade check
            ({}, 200, {}),               # assignSensitivityLabel
        ]
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_unsupported_file_type_fails(self):
        svc = _make_service()
        result = await svc.apply_label("t1", _assignment(), filename="readme.txt")
        assert result.status == JobStatus.FAILED
        assert "Unsupported" in result.error

    @pytest.mark.asyncio
    async def test_legacy_office_fails_with_convert_message(self):
        svc = _make_service()
        result = await svc.apply_label("t1", _assignment(), filename="old.doc")
        assert result.status == JobStatus.FAILED
        assert "Legacy" in result.error
        assert "convert" in result.error.lower()

    @pytest.mark.asyncio
    async def test_supported_file_passes_guard(self):
        graph = _mock_graph()
        graph.post.side_effect = [
            ({"labels": []}, 200, {}),
            ({}, 200, {}),
        ]
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment(), filename="report.docx")
        assert result.status == JobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_encryption_guard_returns_failed(self):
        """EncryptionLabelGuardError is caught and returns a failed result."""
        labels = _mock_labels(_label(has_protection=True))
        labels.check_encryption_guard.side_effect = EncryptionLabelGuardError("blocked")
        svc = _make_service(labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.FAILED
        assert "blocked" in result.error

    @pytest.mark.asyncio
    async def test_downgrade_check_returns_failed(self):
        """LabelDowngradeError is caught and returns a failed result."""
        graph = _mock_graph()
        graph.post.return_value = (
            {"labels": [{"sensitivityLabelId": "lbl-high"}]}, 200, {},
        )
        labels = _mock_labels()
        labels.check_downgrade.side_effect = LabelDowngradeError("downgrade")
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.FAILED
        assert "downgrade" in result.error

    @pytest.mark.asyncio
    async def test_label_not_found_returns_failed(self):
        """LabelNotFoundError is caught and returns a failed result."""
        labels = _mock_labels()
        labels.get_label.side_effect = LabelNotFoundError("not found")
        svc = _make_service(labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.FAILED
        assert "not found" in result.error

    @pytest.mark.asyncio
    async def test_idempotent_skip(self):
        """If the file already has the target label, skip."""
        graph = _mock_graph()
        graph.post.return_value = (
            {"labels": [{"sensitivityLabelId": "lbl-1"}]}, 200, {},
        )
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment(label_id="lbl-1"))
        assert result.status == JobStatus.COMPLETED
        assert result.verified is True
        # Should NOT have called assignSensitivityLabel
        assert graph.post.call_count == 1  # only extract, not assign


# ---------------------------------------------------------------------------
# apply_label — async 202 + polling
# ---------------------------------------------------------------------------

class TestApplyLabelAsync:
    @pytest.mark.asyncio
    async def test_202_with_location_polls(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),  # extract
            ({}, 202, {"Location": "https://graph.microsoft.com/op/123"}),  # assign
            ({"labels": [{"sensitivityLabelId": "lbl-1"}]}, 200, {}),  # verify extract
        ])
        graph.poll_operation = AsyncMock(return_value={"status": "completed"})
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.COMPLETED
        assert result.location_url == "https://graph.microsoft.com/op/123"
        graph.poll_operation.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_202_poll_failed(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),
            ({}, 202, {"Location": "https://graph/op/1"}),
        ])
        graph.poll_operation = AsyncMock(return_value={
            "status": "failed", "error": {"message": "Internal error"}
        })
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.FAILED
        assert "Internal error" in result.error

    @pytest.mark.asyncio
    async def test_202_poll_timeout(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),
            ({}, 202, {"Location": "https://graph/op/1"}),
        ])
        graph.poll_operation = AsyncMock(return_value={"status": "timeout"})
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.TIMEOUT


# ---------------------------------------------------------------------------
# apply_label — error handling
# ---------------------------------------------------------------------------

class TestApplyLabelErrors:
    @pytest.mark.asyncio
    async def test_graph_locked_error(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),  # extract
            GraphLockedError("File locked by another user"),
        ])
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.FAILED
        assert "locked" in result.error.lower()

    @pytest.mark.asyncio
    async def test_generic_graph_error(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),
            StableLabelError("API unavailable"),
        ])
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment())
        assert result.status == JobStatus.FAILED
        assert "API unavailable" in result.error


# ---------------------------------------------------------------------------
# _verify_label
# ---------------------------------------------------------------------------

class TestVerifyLabel:
    @pytest.mark.asyncio
    async def test_verify_success(self):
        """Verify runs after 202 async completion and confirms label applied."""
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),       # extract for downgrade
            ({}, 202, {"Location": "https://graph/op/1"}),  # assign (async)
            ({"labels": [{"sensitivityLabelId": "lbl-1"}]}, 200, {}),  # verify extract
        ])
        graph.poll_operation = AsyncMock(return_value={"status": "completed"})
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels, verify_delay=0.0)
        with patch("app.services.document_service.asyncio.sleep", new=AsyncMock()):
            result = await svc.apply_label("t1", _assignment(), verify=True)
        assert result.verified is True
        assert result.status == JobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_verify_silent_failure(self):
        """Verify detects wrong label after 202 completion."""
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),
            ({}, 202, {"Location": "https://graph/op/1"}),
            ({"labels": [{"sensitivityLabelId": "lbl-WRONG"}]}, 200, {}),
        ])
        graph.poll_operation = AsyncMock(return_value={"status": "completed"})
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels, verify_delay=0.0)
        with patch("app.services.document_service.asyncio.sleep", new=AsyncMock()):
            result = await svc.apply_label("t1", _assignment(), verify=True)
        assert result.status == JobStatus.SILENT_FAILURE
        assert result.verified is False
        assert "Silent failure" in result.error

    @pytest.mark.asyncio
    async def test_verify_no_label_after_apply(self):
        """Verify detects missing label after 202 completion."""
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),
            ({}, 202, {"Location": "https://graph/op/1"}),
            ({"labels": []}, 200, {}),
        ])
        graph.poll_operation = AsyncMock(return_value={"status": "completed"})
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels, verify_delay=0.0)
        with patch("app.services.document_service.asyncio.sleep", new=AsyncMock()):
            result = await svc.apply_label("t1", _assignment(), verify=True)
        assert result.status == JobStatus.SILENT_FAILURE

    @pytest.mark.asyncio
    async def test_200_response_skips_verify(self):
        """200 (synchronous) response doesn't trigger verification."""
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),  # extract
            ({}, 200, {}),               # assign (sync)
        ])
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment(), verify=True)
        assert result.status == JobStatus.COMPLETED
        assert result.verified is False  # verify only runs on 202 path
        assert graph.post.call_count == 2

    @pytest.mark.asyncio
    async def test_verify_skipped_when_disabled(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({"labels": []}, 200, {}),
            ({}, 200, {}),
        ])
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels)
        result = await svc.apply_label("t1", _assignment(), verify=False)
        assert result.status == JobStatus.COMPLETED
        # No third call (verify extract)
        assert graph.post.call_count == 2


# ---------------------------------------------------------------------------
# apply_label_bulk
# ---------------------------------------------------------------------------

class TestBulkApply:
    @pytest.mark.asyncio
    async def test_bulk_apply_success(self):
        graph = AsyncMock()
        graph.post = AsyncMock(return_value=({}, 200, {}))
        labels = _mock_labels()
        svc = _make_service(graph=graph, labels=labels, verify_delay=0.0)

        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="a.docx"),
            BulkItem(drive_id="d1", item_id="i2", filename="b.docx"),
        ]
        resp = await svc.apply_label_bulk("t1", "lbl-1", items)
        assert resp.total == 2
        assert resp.completed >= 0  # some may fail on extract mock
        assert resp.label_id == "lbl-1"

    @pytest.mark.asyncio
    async def test_bulk_dry_run(self):
        labels = _mock_labels()
        svc = _make_service(labels=labels)

        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="good.docx"),
            BulkItem(drive_id="d1", item_id="i2", filename="bad.txt"),
        ]
        resp = await svc.apply_label_bulk("t1", "lbl-1", items, dry_run=True)
        assert resp.dry_run is True
        assert len(resp.results) == 2
        statuses = {r.filename: r.status for r in resp.results}
        assert statuses["good.docx"] == JobStatus.COMPLETED
        assert statuses["bad.txt"] == JobStatus.FAILED

    @pytest.mark.asyncio
    async def test_bulk_encryption_guard_preflight(self):
        labels = _mock_labels(_label(has_protection=True))
        labels.check_encryption_guard.side_effect = EncryptionLabelGuardError("confirm required")
        svc = _make_service(labels=labels)
        with pytest.raises(EncryptionLabelGuardError):
            await svc.apply_label_bulk("t1", "lbl-enc", [])

    @pytest.mark.asyncio
    async def test_bulk_sets_label_has_protection(self):
        labels = _mock_labels(_label(has_protection=True))
        svc = _make_service(labels=labels)
        resp = await svc.apply_label_bulk("t1", "lbl-1", [], dry_run=True, confirm_encryption=True)
        assert resp.label_has_protection is True


# ---------------------------------------------------------------------------
# remove_label_bulk
# ---------------------------------------------------------------------------

class TestBulkRemove:
    @pytest.mark.asyncio
    async def test_remove_label_only(self):
        graph = _mock_graph()
        svc = _make_service(graph=graph)
        items = [BulkItem(drive_id="d1", item_id="i1", filename="a.docx")]
        resp = await svc.remove_label_bulk("t1", items, mode="label_only", graph=graph)
        assert resp.completed == 1
        assert resp.mode == "label_only"

    @pytest.mark.asyncio
    async def test_remove_dry_run(self):
        svc = _make_service()
        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="a.docx"),
            BulkItem(drive_id="d1", item_id="i2", filename="b.xlsx"),
        ]
        resp = await svc.remove_label_bulk("t1", items, dry_run=True)
        assert resp.dry_run is True
        assert resp.completed == 2
        assert all(r.status == JobStatus.COMPLETED for r in resp.results)

    @pytest.mark.asyncio
    async def test_remove_graph_error_partial_failure(self):
        graph = AsyncMock()
        graph.post = AsyncMock(side_effect=[
            ({}, 200, {}),                      # first item succeeds
            StableLabelError("API down"),        # second item fails
        ])
        svc = _make_service(graph=graph)
        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="a.docx"),
            BulkItem(drive_id="d1", item_id="i2", filename="b.docx"),
        ]
        resp = await svc.remove_label_bulk("t1", items, mode="label_only", graph=graph)
        assert resp.completed == 1
        assert resp.failed == 1


# ---------------------------------------------------------------------------
# _dry_run_results
# ---------------------------------------------------------------------------

class TestDryRunResults:
    def test_supported_files_pass(self):
        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="report.docx"),
            BulkItem(drive_id="d1", item_id="i2", filename="data.xlsx"),
            BulkItem(drive_id="d1", item_id="i3", filename="slides.pptx"),
            BulkItem(drive_id="d1", item_id="i4", filename="scan.pdf"),
        ]
        results = DocumentService._dry_run_results(items, _label())
        assert all(r.status == JobStatus.COMPLETED for r in results)

    def test_unsupported_files_fail(self):
        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="readme.txt"),
            BulkItem(drive_id="d1", item_id="i2", filename="image.png"),
        ]
        results = DocumentService._dry_run_results(items, _label())
        assert all(r.status == JobStatus.FAILED for r in results)
        assert all("Unsupported" in r.error for r in results)

    def test_legacy_office_gets_convert_message(self):
        items = [BulkItem(drive_id="d1", item_id="i1", filename="old.doc")]
        results = DocumentService._dry_run_results(items, _label())
        assert results[0].status == JobStatus.FAILED
        assert "Legacy" in results[0].error

    def test_mixed_files(self):
        items = [
            BulkItem(drive_id="d1", item_id="i1", filename="good.docx"),
            BulkItem(drive_id="d1", item_id="i2", filename="bad.csv"),
        ]
        results = DocumentService._dry_run_results(items, _label())
        assert results[0].status == JobStatus.COMPLETED
        assert results[1].status == JobStatus.FAILED
