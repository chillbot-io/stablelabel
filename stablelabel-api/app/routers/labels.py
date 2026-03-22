"""Label inventory and management endpoints.

Read endpoints: list, inspect, and filter sensitivity labels for a tenant.
Write endpoints: create, update, delete labels via Graph API with PowerShell fallback.
Encryption labels are flagged so the UI can warn before bulk operations.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.dependencies import get_label_management_service, get_label_service
from app.models.label import SensitivityLabel
from app.services.label_management import LabelConfig, LabelManagementService
from app.services.label_service import LabelService

router = APIRouter(prefix="/tenants/{tenant_id}/labels", tags=["labels"])


@router.get("", response_model=list[SensitivityLabel])
async def list_labels(
    tenant_id: str,
    appliable_only: bool = Query(
        False, description="Only show labels that can be applied to files"
    ),
    force_refresh: bool = Query(False, description="Bypass label cache"),
    user: CurrentUser = Depends(require_role("Viewer")),
    db=Depends(get_session),
    svc: LabelService = Depends(get_label_service),
) -> list[SensitivityLabel]:
    """List all sensitivity labels for a tenant.

    Labels with has_protection=True carry encryption — the UI should
    display these distinctly and require confirmation before bulk apply.
    """
    await check_tenant_access(user, tenant_id, db)
    if appliable_only:
        return await svc.get_appliable_labels(tenant_id)
    return await svc.get_labels(tenant_id, force=force_refresh)


@router.get("/{label_id}", response_model=SensitivityLabel)
async def get_label(
    tenant_id: str,
    label_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db=Depends(get_session),
    svc: LabelService = Depends(get_label_service),
) -> SensitivityLabel:
    """Get a single label by ID.  Raises 404 if disabled or deleted."""
    await check_tenant_access(user, tenant_id, db)
    return await svc.get_label(tenant_id, label_id)


# ── Label management (write operations) ────────────────────────


class CreateLabelRequest(BaseModel):
    name: str
    display_name: str = ""
    description: str = ""
    tooltip: str = ""
    color: str = ""
    parent_id: str | None = None


class UpdateLabelRequest(BaseModel):
    name: str | None = None
    display_name: str | None = None
    description: str | None = None
    tooltip: str | None = None
    color: str | None = None


@router.post("", status_code=201)
async def create_label_definition(
    tenant_id: str,
    body: CreateLabelRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
    mgmt: LabelManagementService = Depends(get_label_management_service),
) -> dict[str, Any]:
    """Create a new sensitivity label (Graph API, with PowerShell fallback)."""
    await check_tenant_access(user, tenant_id, db)
    config = LabelConfig(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        tooltip=body.tooltip,
        color=body.color,
        parent_id=body.parent_id,
    )
    return await mgmt.create_label(tenant_id, config)


@router.patch("/{label_id}")
async def update_label_definition(
    tenant_id: str,
    label_id: str,
    body: UpdateLabelRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
    mgmt: LabelManagementService = Depends(get_label_management_service),
) -> dict[str, Any]:
    """Update a sensitivity label (Graph API, with PowerShell fallback)."""
    await check_tenant_access(user, tenant_id, db)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    config = LabelConfig(name=updates.get("name", ""), **{
        k: v for k, v in updates.items() if k != "name"
    })
    return await mgmt.update_label(tenant_id, label_id, config)


@router.delete("/{label_id}", status_code=204)
async def delete_label_definition(
    tenant_id: str,
    label_id: str,
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
    mgmt: LabelManagementService = Depends(get_label_management_service),
) -> None:
    """Delete a sensitivity label (Graph API, with PowerShell fallback)."""
    await check_tenant_access(user, tenant_id, db)
    await mgmt.delete_label(tenant_id, label_id)
