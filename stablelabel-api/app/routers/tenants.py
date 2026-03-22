"""Tenant management routes — connect, list, and disconnect customer tenants.

Part of the Security pane. Only Admins can manage tenant connections.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import require_role
from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant, UserTenantAccess

router = APIRouter(prefix="/security/tenants", tags=["security"])


# ── Request/Response schemas ────────────────────────────────


class ConnectTenantRequest(BaseModel):
    entra_tenant_id: str
    display_name: str = ""


class TenantResponse(BaseModel):
    id: str
    entra_tenant_id: str
    display_name: str
    consent_status: str
    consented_at: datetime | None
    created_at: datetime
    user_count: int = 0

    model_config = {"from_attributes": True}


class ConsentUrlResponse(BaseModel):
    consent_url: str
    customer_tenant_id: str


# ── Routes ──────────────────────────────────────────────────


@router.get("", response_model=list[TenantResponse])
async def list_tenants(
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> list[TenantResponse]:
    """List all connected customer tenants for the MSP."""
    # Get tenants with user counts
    stmt = (
        select(
            CustomerTenant,
            func.count(UserTenantAccess.id).label("user_count"),
        )
        .outerjoin(
            UserTenantAccess,
            UserTenantAccess.customer_tenant_id == CustomerTenant.id,
        )
        .where(CustomerTenant.msp_tenant_id == uuid.UUID(user.msp_tenant_id))
        .group_by(CustomerTenant.id)
        .order_by(CustomerTenant.display_name)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        TenantResponse(
            id=str(tenant.id),
            entra_tenant_id=tenant.entra_tenant_id,
            display_name=tenant.display_name,
            consent_status=tenant.consent_status,
            consented_at=tenant.consented_at,
            created_at=tenant.created_at,
            user_count=user_count,
        )
        for tenant, user_count in rows
    ]


@router.post("", response_model=ConsentUrlResponse, status_code=201)
async def connect_tenant(
    body: ConnectTenantRequest,
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> ConsentUrlResponse:
    """Register a new customer tenant and return the admin consent URL."""
    msp_id = uuid.UUID(user.msp_tenant_id)

    # Check for duplicates
    stmt = select(CustomerTenant).where(
        CustomerTenant.msp_tenant_id == msp_id,
        CustomerTenant.entra_tenant_id == body.entra_tenant_id,
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(409, "Tenant already connected")

    tenant = CustomerTenant(
        msp_tenant_id=msp_id,
        entra_tenant_id=body.entra_tenant_id,
        display_name=body.display_name or body.entra_tenant_id,
        consent_status="pending",
    )
    db.add(tenant)

    # Audit log
    db.add(AuditEvent(
        msp_tenant_id=msp_id,
        customer_tenant_id=tenant.id,
        actor_id=uuid.UUID(user.id),
        event_type="tenant.connected",
        extra={"entra_tenant_id": body.entra_tenant_id},
    ))

    await db.commit()
    await db.refresh(tenant)

    # Build admin consent URL for the Data Connector app
    # The actual client_id should come from settings, but for now we return a template
    consent_url = (
        f"https://login.microsoftonline.com/{body.entra_tenant_id}/adminconsent"
        f"?client_id={{DATA_CONNECTOR_CLIENT_ID}}"
        f"&redirect_uri={{REDIRECT_URI}}"
    )

    return ConsentUrlResponse(
        consent_url=consent_url,
        customer_tenant_id=str(tenant.id),
    )


@router.patch("/{tenant_id}/consent", response_model=TenantResponse)
async def confirm_consent(
    tenant_id: str,
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> TenantResponse:
    """Mark a tenant as consented (called after admin consent callback)."""
    stmt = select(CustomerTenant).where(
        CustomerTenant.id == uuid.UUID(tenant_id),
        CustomerTenant.msp_tenant_id == uuid.UUID(user.msp_tenant_id),
    )
    result = await db.execute(stmt)
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    tenant.consent_status = "active"
    tenant.consented_at = datetime.now(UTC)

    db.add(AuditEvent(
        msp_tenant_id=uuid.UUID(user.msp_tenant_id),
        customer_tenant_id=tenant.id,
        actor_id=uuid.UUID(user.id),
        event_type="tenant.consent_confirmed",
    ))

    await db.commit()
    await db.refresh(tenant)

    return TenantResponse(
        id=str(tenant.id),
        entra_tenant_id=tenant.entra_tenant_id,
        display_name=tenant.display_name,
        consent_status=tenant.consent_status,
        consented_at=tenant.consented_at,
        created_at=tenant.created_at,
    )


@router.delete("/{tenant_id}", status_code=204)
async def disconnect_tenant(
    tenant_id: str,
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Disconnect a customer tenant. Cascades to access grants and jobs."""
    stmt = select(CustomerTenant).where(
        CustomerTenant.id == uuid.UUID(tenant_id),
        CustomerTenant.msp_tenant_id == uuid.UUID(user.msp_tenant_id),
    )
    result = await db.execute(stmt)
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    db.add(AuditEvent(
        msp_tenant_id=uuid.UUID(user.msp_tenant_id),
        customer_tenant_id=tenant.id,
        actor_id=uuid.UUID(user.id),
        event_type="tenant.disconnected",
        extra={"display_name": tenant.display_name},
    ))

    await db.delete(tenant)
    await db.commit()
