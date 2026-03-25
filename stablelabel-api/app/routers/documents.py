"""Document labeling endpoints.

Apply, extract, bulk-apply, remove, and CSV-upload sensitivity labels on files.
Every landmine guard fires before the Graph call.
"""

from __future__ import annotations

import csv
import io
import logging
import re
import uuid

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.core.entra_auth import CurrentUser
from app.core.exceptions import (
    EncryptionLabelGuardError,
    LabelDowngradeError,
    LabelNotFoundError,
    StableLabelError,
)
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.dependencies import get_document_service, get_graph_client
from app.models.document import (
    BulkItem,
    BulkLabelRequest,
    BulkLabelResponse,
    BulkRemoveRequest,
    BulkRemoveResponse,
    CsvUploadResult,
    DocumentLabel,
    LabelAssignment,
    LabelJobResult,
    RemoveLabelRequest,
)
from app.services.document_service import DocumentService
from app.services.graph_client import GraphClient

router = APIRouter(prefix="/tenants/{tenant_id}/documents", tags=["documents"])

# Graph API IDs are alphanumeric with hyphens, dots, and exclamation marks.
# Reject anything that could be a path traversal (/, .., \).
_SAFE_GRAPH_ID = re.compile(r"^[a-zA-Z0-9!._-]+$")


def _validate_graph_id(value: str, name: str) -> str:
    """Validate a Graph API ID (drive_id, item_id) against path injection."""
    if not value or not _SAFE_GRAPH_ID.match(value):
        raise HTTPException(400, f"Invalid {name}: must be alphanumeric")
    if ".." in value:
        raise HTTPException(400, f"Invalid {name}: path traversal not allowed")
    return value


@router.post("/extract-label", response_model=DocumentLabel | None)
async def extract_label(
    tenant_id: str,
    drive_id: str,
    item_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db=Depends(get_session),
    svc: DocumentService = Depends(get_document_service),
) -> DocumentLabel | None:
    """Read the current sensitivity label on a file."""
    await check_tenant_access(user, tenant_id, db)
    _validate_graph_id(drive_id, "drive_id")
    _validate_graph_id(item_id, "item_id")
    return await svc.extract_label(tenant_id, drive_id, item_id)


@router.post("/apply-label", response_model=LabelJobResult)
async def apply_label(
    tenant_id: str,
    assignment: LabelAssignment,
    confirm_encryption: bool = False,
    user: CurrentUser = Depends(require_role("Operator")),
    db=Depends(get_session),
    svc: DocumentService = Depends(get_document_service),
) -> LabelJobResult:
    """Apply a sensitivity label to a single file."""
    await check_tenant_access(user, tenant_id, db)
    _validate_graph_id(assignment.drive_id, "drive_id")
    _validate_graph_id(assignment.item_id, "item_id")
    try:
        return await svc.apply_label(
            tenant_id,
            assignment,
            confirm_encryption=confirm_encryption,
        )
    except EncryptionLabelGuardError as exc:
        logger.warning("EncryptionLabelGuardError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=422, detail="Label has encryption protection. Set confirm_encryption=True to proceed.") from None
    except LabelDowngradeError as exc:
        logger.warning("LabelDowngradeError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=409, detail="Label downgrade requires justification") from None
    except LabelNotFoundError as exc:
        logger.warning("LabelNotFoundError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=404, detail="Label not found") from None
    except StableLabelError as exc:
        logger.warning("StableLabelError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=502, detail="Label operation failed") from None


@router.post("/remove-label", status_code=204)
async def remove_label(
    tenant_id: str,
    request: RemoveLabelRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db=Depends(get_session),
    graph: GraphClient = Depends(get_graph_client),
) -> None:
    """Remove the sensitivity label from a single file."""
    await check_tenant_access(user, tenant_id, db)
    _validate_graph_id(request.drive_id, "drive_id")
    _validate_graph_id(request.item_id, "item_id")
    try:
        await graph.post(
            tenant_id,
            f"/drives/{request.drive_id}/items/{request.item_id}/deleteSensitivityLabel",
        )
    except StableLabelError as exc:
        logger.warning("StableLabelError during remove_label for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=502, detail="Label operation failed") from None


@router.post("/apply-label-bulk", response_model=BulkLabelResponse)
async def apply_label_bulk(
    tenant_id: str,
    request: BulkLabelRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db=Depends(get_session),
    svc: DocumentService = Depends(get_document_service),
) -> BulkLabelResponse:
    """Apply a label to multiple files with full guard chain."""
    await check_tenant_access(user, tenant_id, db)
    for item in request.items:
        _validate_graph_id(item.drive_id, "drive_id")
        _validate_graph_id(item.item_id, "item_id")
    if request.tenant_id != tenant_id:
        raise HTTPException(
            status_code=400,
            detail="tenant_id in path must match request body",
        )

    try:
        return await svc.apply_label_bulk(
            tenant_id=tenant_id,
            label_id=request.sensitivity_label_id,
            items=request.items,
            assignment_method=request.assignment_method,
            justification_text=request.justification_text,
            confirm_encryption=request.confirm_encryption,
            dry_run=request.dry_run,
        )
    except EncryptionLabelGuardError as exc:
        logger.warning("EncryptionLabelGuardError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=422, detail="Label has encryption protection. Set confirm_encryption=True to proceed.") from None
    except LabelDowngradeError as exc:
        logger.warning("LabelDowngradeError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=409, detail="Label downgrade requires justification") from None
    except LabelNotFoundError as exc:
        logger.warning("LabelNotFoundError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=404, detail="Label not found") from None
    except StableLabelError as exc:
        logger.warning("StableLabelError for tenant %s: %s", tenant_id, exc)
        raise HTTPException(status_code=502, detail="Label operation failed") from None


@router.post("/remove-label-bulk", response_model=BulkRemoveResponse)
async def remove_label_bulk(
    tenant_id: str,
    request: BulkRemoveRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db=Depends(get_session),
    svc: DocumentService = Depends(get_document_service),
    graph: GraphClient = Depends(get_graph_client),
) -> BulkRemoveResponse:
    """Bulk remove labels from files.

    Modes:
      - label_only: Remove the sensitivity label metadata
      - encryption_only: Remove protection/encryption but keep the label
      - label_and_encryption: Remove both label and protection
    """
    await check_tenant_access(user, tenant_id, db)
    if request.tenant_id != tenant_id:
        raise HTTPException(400, "tenant_id in path must match request body")

    return await svc.remove_label_bulk(
        tenant_id=tenant_id,
        items=request.items,
        mode=request.mode,
        dry_run=request.dry_run,
        graph=graph,
    )


@router.post("/upload-csv", response_model=CsvUploadResult)
async def upload_csv_labels(
    tenant_id: str,
    file: UploadFile,
    user: CurrentUser = Depends(require_role("Operator")),
    db=Depends(get_session),
    svc: DocumentService = Depends(get_document_service),
) -> CsvUploadResult:
    """Upload a CSV file to apply labels to files in bulk.

    Expected CSV columns: drive_id, item_id, filename, label_id
    """
    await check_tenant_access(user, tenant_id, db)

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(400, "File must be a .csv")

    # Read with size limit to prevent memory exhaustion — stop early
    _MAX_CSV_SIZE = 10 * 1024 * 1024
    content = await file.read(_MAX_CSV_SIZE + 1)
    if len(content) > _MAX_CSV_SIZE:
        raise HTTPException(400, "CSV file too large (max 10MB)")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "CSV must be UTF-8 encoded") from None

    reader = csv.DictReader(io.StringIO(text))
    required_cols = {"drive_id", "item_id", "filename", "label_id"}
    if not reader.fieldnames or not required_cols.issubset(set(reader.fieldnames)):
        raise HTTPException(
            400,
            f"CSV must contain columns: {', '.join(sorted(required_cols))}. "
            f"Found: {', '.join(reader.fieldnames or [])}",
        )

    rows = list(reader)
    errors: list[str] = []
    items_by_label: dict[str, list[BulkItem]] = {}

    for i, row in enumerate(rows, start=2):
        drive_id = row.get("drive_id", "").strip()
        item_id = row.get("item_id", "").strip()
        filename = row.get("filename", "").strip()
        label_id = row.get("label_id", "").strip()

        if not all([drive_id, item_id, filename, label_id]):
            errors.append(f"Row {i}: missing required fields")
            continue

        items_by_label.setdefault(label_id, []).append(
            BulkItem(drive_id=drive_id, item_id=item_id, filename=filename)
        )

    parse_error_count = len(errors)
    apply_failed_count = 0

    for label_id, items in items_by_label.items():
        try:
            result = await svc.apply_label_bulk(
                tenant_id=tenant_id,
                label_id=label_id,
                items=items,
            )
            # Track failures from bulk apply
            for r in result.results:
                if r.status == "failed":
                    apply_failed_count += 1
                    errors.append(f"{r.filename}: {r.error}")
        except Exception as exc:
            apply_failed_count += len(items)
            errors.append(f"Label {label_id}: {exc}")

    # Truncate errors after all collection is complete
    if len(errors) > 50:
        errors = errors[:50] + [f"... and {len(errors) - 50} more errors"]

    total_invalid = parse_error_count + apply_failed_count
    return CsvUploadResult(
        total_rows=len(rows),
        valid_rows=len(rows) - parse_error_count,
        invalid_rows=total_invalid,
        errors=errors,
    )
