"""Label inventory endpoints.

List, inspect, and filter sensitivity labels for a tenant.
Encryption labels are flagged so the UI can warn before bulk operations.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_label_service
from app.models.label import SensitivityLabel
from app.services.label_service import LabelService

router = APIRouter(prefix="/tenants/{tenant_id}/labels", tags=["labels"])


@router.get("", response_model=list[SensitivityLabel])
async def list_labels(
    tenant_id: str,
    appliable_only: bool = Query(False, description="Only show labels that can be applied to files"),
    force_refresh: bool = Query(False, description="Bypass label cache"),
    svc: LabelService = Depends(get_label_service),
) -> list[SensitivityLabel]:
    """List all sensitivity labels for a tenant.

    Labels with has_protection=True carry encryption — the UI should
    display these distinctly and require confirmation before bulk apply.
    """
    if appliable_only:
        return await svc.get_appliable_labels(tenant_id)
    return await svc.get_labels(tenant_id, force=force_refresh)


@router.get("/{label_id}", response_model=SensitivityLabel)
async def get_label(
    tenant_id: str,
    label_id: str,
    svc: LabelService = Depends(get_label_service),
) -> SensitivityLabel:
    """Get a single label by ID.  Raises 404 if disabled or deleted."""
    return await svc.get_label(tenant_id, label_id)
