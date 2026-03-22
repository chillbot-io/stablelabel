"""Document labeling service — apply, extract, verify labels on files.

Encodes the critical landmines:
  - File type validation BEFORE calling Graph (inconsistent error responses)
  - Encryption guard check via LabelService
  - Downgrade detection with justification
  - Async operation tracking with polling
  - Post-apply verification (never trust 202 alone)
  - Concurrency control for bulk operations
  - Version history awareness (each label = new SP version)
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from app.core.exceptions import (
    GraphLockedError,
    SilentFailureError,
    UnsupportedFileTypeError,
)
from app.core.file_types import is_legacy_office, is_supported
from app.models.document import (
    AssignmentMethod,
    BulkItem,
    BulkLabelResponse,
    DocumentLabel,
    JobStatus,
    LabelAssignment,
    LabelJobResult,
)
from app.models.label import SensitivityLabel
from app.services.graph_client import GraphClient
from app.services.label_service import LabelService

logger = logging.getLogger(__name__)

# Max concurrent label operations per tenant — above 20-30 triggers 429
_MAX_CONCURRENT = 8


class DocumentService:
    """Handles all file-level labeling operations."""

    def __init__(self, graph: GraphClient, labels: LabelService) -> None:
        self._graph = graph
        self._labels = labels

    # ── Read operations ───────────────────────────────────────────

    async def extract_label(
        self, tenant_id: str, drive_id: str, item_id: str
    ) -> DocumentLabel | None:
        """Read the current sensitivity label on a file.

        Returns None if the file has no label.
        Only works on supported file types (Office + PDF).
        """
        body, status, _headers = await self._graph.post(
            tenant_id,
            f"/drives/{drive_id}/items/{item_id}/extractSensitivityLabels",
        )
        labels_list = body.get("labels", [])
        if not labels_list:
            return None

        first = labels_list[0]
        return DocumentLabel(
            sensitivity_label_id=first.get("sensitivityLabelId", ""),
            assignment_method=first.get("assignmentMethod", ""),
            tenant_id=first.get("tenantId", ""),
        )

    # ── Write operations ──────────────────────────────────────────

    async def apply_label(
        self,
        tenant_id: str,
        assignment: LabelAssignment,
        *,
        filename: str = "",
        confirm_encryption: bool = False,
        verify: bool = True,
    ) -> LabelJobResult:
        """Apply a sensitivity label to a single file.

        Full guard chain:
          1. File type check
          2. Label exists and is appliable
          3. Encryption guard
          4. Downgrade check
          5. Call Graph API
          6. Poll async operation
          7. Verify label actually applied (optional but recommended)
        """
        result = LabelJobResult(
            drive_id=assignment.drive_id,
            item_id=assignment.item_id,
            filename=filename,
        )

        # Guard 1: File type
        if filename and not is_supported(filename):
            if is_legacy_office(filename):
                result.status = JobStatus.FAILED
                result.error = f"Legacy format '{filename}' — convert to modern Office first"
            else:
                result.status = JobStatus.FAILED
                result.error = f"Unsupported file type: {filename}"
            return result

        try:
            # Guard 2: Label validity
            target_label = await self._labels.get_label(
                tenant_id, assignment.sensitivity_label_id
            )

            # Guard 3: Encryption
            self._labels.check_encryption_guard(target_label, confirmed=confirm_encryption)

            # Guard 4: Downgrade — extract current label first
            current_doc_label = await self.extract_label(
                tenant_id, assignment.drive_id, assignment.item_id
            )
            if current_doc_label and current_doc_label.sensitivity_label_id:
                current_label = await self._labels.get_label(
                    tenant_id, current_doc_label.sensitivity_label_id
                )
                self._labels.check_downgrade(
                    current_label,
                    target_label,
                    justification=assignment.justification_text,
                    assignment_method=assignment.assignment_method,
                )

                # Idempotency: skip if already labeled correctly
                if current_doc_label.sensitivity_label_id == assignment.sensitivity_label_id:
                    result.status = JobStatus.COMPLETED
                    result.verified = True
                    return result

            # Guard 5: Call Graph
            body: dict[str, Any] = {
                "sensitivityLabelId": assignment.sensitivity_label_id,
                "assignmentMethod": assignment.assignment_method,
            }
            if assignment.justification_text:
                body["justificationText"] = assignment.justification_text

            _resp_body, status_code, headers = await self._graph.post(
                tenant_id,
                f"/drives/{assignment.drive_id}/items/{assignment.item_id}/assignSensitivityLabel",
                json=body,
            )

            if status_code == 202:
                result.status = JobStatus.RUNNING
                result.location_url = headers.get("Location", headers.get("location", ""))

                # Guard 6: Poll for completion
                if result.location_url:
                    op_result = await self._graph.poll_operation(result.location_url)
                    op_status = op_result.get("status", "")
                    if op_status == "completed":
                        result.status = JobStatus.COMPLETED
                    elif op_status == "failed":
                        result.status = JobStatus.FAILED
                        result.error = op_result.get("error", {}).get("message", "Unknown")
                    elif op_status == "timeout":
                        result.status = JobStatus.TIMEOUT
                        result.error = "Operation did not complete within timeout"

                # Guard 7: Verify — never trust 202 alone
                if verify and result.status == JobStatus.COMPLETED:
                    await self._verify_label(tenant_id, assignment, result)
            else:
                result.status = JobStatus.COMPLETED

        except GraphLockedError as exc:
            result.status = JobStatus.FAILED
            result.error = f"File locked: {exc}"
        except UnsupportedFileTypeError as exc:
            result.status = JobStatus.FAILED
            result.error = str(exc)
        except Exception as exc:
            result.status = JobStatus.FAILED
            result.error = str(exc)
            logger.exception("Failed to label %s/%s", assignment.drive_id, assignment.item_id)

        return result

    async def apply_label_bulk(
        self,
        tenant_id: str,
        label_id: str,
        items: list[BulkItem],
        *,
        assignment_method: AssignmentMethod = AssignmentMethod.STANDARD,
        justification_text: str = "",
        confirm_encryption: bool = False,
        dry_run: bool = False,
    ) -> BulkLabelResponse:
        """Apply a label to multiple files with concurrency control.

        Uses a semaphore to cap at _MAX_CONCURRENT parallel operations per
        tenant — going above 20-30 triggers 429 throttling.
        """
        job_id = str(uuid.uuid4())
        response = BulkLabelResponse(
            job_id=job_id,
            tenant_id=tenant_id,
            label_id=label_id,
            total=len(items),
            dry_run=dry_run,
        )

        # Pre-flight: validate the label once
        target_label = await self._labels.get_label(tenant_id, label_id)
        response.label_has_protection = target_label.has_protection
        self._labels.check_encryption_guard(target_label, confirmed=confirm_encryption)

        if dry_run:
            response.results = self._dry_run_results(items, target_label)
            response.completed = sum(
                1 for r in response.results if r.status == JobStatus.COMPLETED
            )
            response.skipped = sum(
                1 for r in response.results if r.status == JobStatus.FAILED
            )
            return response

        # Real execution with concurrency control
        sem = asyncio.Semaphore(_MAX_CONCURRENT)

        async def _apply_one(item: BulkItem) -> LabelJobResult:
            async with sem:
                assignment = LabelAssignment(
                    drive_id=item.drive_id,
                    item_id=item.item_id,
                    sensitivity_label_id=label_id,
                    assignment_method=assignment_method,
                    justification_text=justification_text,
                )
                return await self.apply_label(
                    tenant_id,
                    assignment,
                    filename=item.filename,
                    confirm_encryption=confirm_encryption,
                )

        results = await asyncio.gather(*[_apply_one(item) for item in items])
        response.results = list(results)
        response.completed = sum(1 for r in results if r.status == JobStatus.COMPLETED)
        response.failed = sum(
            1 for r in results if r.status in (JobStatus.FAILED, JobStatus.SILENT_FAILURE)
        )
        return response

    # ── Verification ──────────────────────────────────────────────

    async def _verify_label(
        self,
        tenant_id: str,
        assignment: LabelAssignment,
        result: LabelJobResult,
    ) -> None:
        """Re-extract the label to confirm it was actually applied.

        Catches the silent-failure landmine: 202 Accepted but nothing happened.
        """
        await asyncio.sleep(2.0)  # brief delay for propagation

        try:
            doc_label = await self.extract_label(
                tenant_id, assignment.drive_id, assignment.item_id
            )
            if doc_label and doc_label.sensitivity_label_id == assignment.sensitivity_label_id:
                result.verified = True
            else:
                result.status = JobStatus.SILENT_FAILURE
                result.verified = False
                actual = doc_label.sensitivity_label_id if doc_label else "none"
                result.error = (
                    f"Silent failure: expected label {assignment.sensitivity_label_id}, "
                    f"found {actual}. File may have been mid-processing."
                )
                logger.warning(
                    "Silent failure on %s/%s: expected %s, got %s",
                    assignment.drive_id,
                    assignment.item_id,
                    assignment.sensitivity_label_id,
                    actual,
                )
        except Exception as exc:
            logger.warning("Verification failed for %s/%s: %s",
                          assignment.drive_id, assignment.item_id, exc)
            result.verified = False

    # ── Dry run ───────────────────────────────────────────────────

    @staticmethod
    def _dry_run_results(
        items: list[BulkItem], target_label: SensitivityLabel
    ) -> list[LabelJobResult]:
        """Simulate labeling without calling Graph — validates file types."""
        results = []
        for item in items:
            r = LabelJobResult(
                drive_id=item.drive_id,
                item_id=item.item_id,
                filename=item.filename,
            )
            if not is_supported(item.filename):
                r.status = JobStatus.FAILED
                if is_legacy_office(item.filename):
                    r.error = f"Legacy format — convert to modern Office first"
                else:
                    r.error = f"Unsupported file type"
            else:
                r.status = JobStatus.COMPLETED
            results.append(r)
        return results
