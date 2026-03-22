"""Document labeling endpoints.

Apply, extract, and bulk-apply sensitivity labels on files.
Every landmine guard fires before the Graph call.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_document_service
from app.models.document import (
    BulkLabelRequest,
    BulkLabelResponse,
    DocumentLabel,
    LabelAssignment,
    LabelJobResult,
)
from app.core.exceptions import (
    EncryptionLabelGuardError,
    LabelDowngradeError,
    LabelNotFoundError,
    StableLabelError,
)
from app.services.document_service import DocumentService

router = APIRouter(prefix="/tenants/{tenant_id}/documents", tags=["documents"])


@router.post("/extract-label", response_model=DocumentLabel | None)
async def extract_label(
    tenant_id: str,
    drive_id: str,
    item_id: str,
    svc: DocumentService = Depends(get_document_service),
) -> DocumentLabel | None:
    """Read the current sensitivity label on a file."""
    return await svc.extract_label(tenant_id, drive_id, item_id)


@router.post("/apply-label", response_model=LabelJobResult)
async def apply_label(
    tenant_id: str,
    assignment: LabelAssignment,
    confirm_encryption: bool = False,
    svc: DocumentService = Depends(get_document_service),
) -> LabelJobResult:
    """Apply a sensitivity label to a single file.

    Guard chain: file type -> label validity -> encryption check ->
    downgrade check -> Graph API -> poll -> verify.
    """
    try:
        return await svc.apply_label(
            tenant_id,
            assignment,
            confirm_encryption=confirm_encryption,
        )
    except EncryptionLabelGuardError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except LabelDowngradeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except LabelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except StableLabelError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/apply-label-bulk", response_model=BulkLabelResponse)
async def apply_label_bulk(
    tenant_id: str,
    request: BulkLabelRequest,
    svc: DocumentService = Depends(get_document_service),
) -> BulkLabelResponse:
    """Apply a label to multiple files with full guard chain.

    Key safety features:
      - dry_run=True simulates without calling Graph
      - confirm_encryption=True required for labels with protection
      - Concurrency capped at 8 parallel operations per tenant
      - Each file is individually verified after labeling
    """
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
        raise HTTPException(status_code=422, detail=str(exc))
    except LabelDowngradeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except LabelNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except StableLabelError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
