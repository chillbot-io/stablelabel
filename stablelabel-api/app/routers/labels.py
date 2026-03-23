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

import uuid

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant
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
    """Create a top-level sensitivity label."""

    name: str
    display_name: str = ""
    description: str = ""
    tooltip: str = ""
    color: str = ""


class CreateSublabelRequest(BaseModel):
    """Create a sublabel under an existing parent label.

    Sublabels inherit their parent's scope but can have different
    protection settings. Example: Confidential → Confidential/PCI.
    """

    name: str
    display_name: str = ""
    description: str = ""
    tooltip: str = ""
    color: str = ""


class UpdateLabelRequest(BaseModel):
    name: str | None = None
    display_name: str | None = None
    description: str | None = None
    tooltip: str | None = None
    color: str | None = None


@router.post("", status_code=201)
async def create_label(
    tenant_id: str,
    body: CreateLabelRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
    mgmt: LabelManagementService = Depends(get_label_management_service),
) -> dict[str, Any]:
    """Create a new top-level sensitivity label.

    To create a **sublabel** under an existing parent, use
    ``POST /tenants/{tenant_id}/labels/{parent_label_id}/sublabels`` instead.
    """
    await check_tenant_access(user, tenant_id, db)
    config = LabelConfig(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        tooltip=body.tooltip,
        color=body.color,
    )
    result = await mgmt.create_label(tenant_id, config)
    ct = await db.get(CustomerTenant, uuid.UUID(tenant_id))
    if ct:
        db.add(AuditEvent(
            msp_tenant_id=ct.msp_tenant_id,
            customer_tenant_id=ct.id,
            actor_id=uuid.UUID(user.id),
            event_type="label.created",
            extra={"label_name": body.name},
        ))
        await db.commit()
    return result


@router.post("/{parent_label_id}/sublabels", status_code=201)
async def create_sublabel(
    tenant_id: str,
    parent_label_id: str,
    body: CreateSublabelRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
    mgmt: LabelManagementService = Depends(get_label_management_service),
    svc: LabelService = Depends(get_label_service),
) -> dict[str, Any]:
    """Create a sublabel under an existing parent label.

    The parent label must exist and will become a non-appliable parent
    (``is_parent=True``) once it has sublabels. Only leaf sublabels can
    be applied to files.

    Example: ``POST /tenants/{id}/labels/{confidential-id}/sublabels``
    with ``{"name": "PCI", "description": "PCI-DSS regulated content"}``
    creates "Confidential / PCI".
    """
    await check_tenant_access(user, tenant_id, db)

    # Verify parent label exists
    parent = await svc.get_label(tenant_id, parent_label_id)
    if not parent:
        raise HTTPException(404, f"Parent label {parent_label_id} not found")

    config = LabelConfig(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        tooltip=body.tooltip,
        color=body.color,
        parent_id=parent_label_id,
    )
    result = await mgmt.create_label(tenant_id, config)
    ct = await db.get(CustomerTenant, uuid.UUID(tenant_id))
    if ct:
        db.add(AuditEvent(
            msp_tenant_id=ct.msp_tenant_id,
            customer_tenant_id=ct.id,
            actor_id=uuid.UUID(user.id),
            event_type="label.created",
            extra={
                "label_name": body.name,
                "parent_label_id": parent_label_id,
                "is_sublabel": True,
            },
        ))
        await db.commit()
    return result


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
    result = await mgmt.update_label(tenant_id, label_id, config)
    ct = await db.get(CustomerTenant, uuid.UUID(tenant_id))
    if ct:
        db.add(AuditEvent(
            msp_tenant_id=ct.msp_tenant_id,
            customer_tenant_id=ct.id,
            actor_id=uuid.UUID(user.id),
            event_type="label.updated",
            extra={"label_id": label_id, "updates": updates},
        ))
        await db.commit()
    return result


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
    ct = await db.get(CustomerTenant, uuid.UUID(tenant_id))
    if ct:
        db.add(AuditEvent(
            msp_tenant_id=ct.msp_tenant_id,
            customer_tenant_id=ct.id,
            actor_id=uuid.UUID(user.id),
            event_type="label.deleted",
            extra={"label_id": label_id},
        ))
        await db.commit()
