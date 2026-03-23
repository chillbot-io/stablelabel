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

from app.config import Settings
from app.core.entra_auth import CurrentUser
from app.core.rbac import require_role
from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant, UserTenantAccess
from app.dependencies import get_settings

router = APIRouter(prefix="/security/tenants", tags=["security"])


@router.get("/resolve/{domain}")
async def resolve_tenant_domain(
    domain: str,
    _user: CurrentUser = Depends(require_role("Admin")),
) -> dict:
    """Resolve a domain name (e.g. contoso.com) to an Entra tenant ID."""
    import httpx
    import re

    # Validate domain format
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", domain):
        raise HTTPException(400, "Invalid domain format")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://login.microsoftonline.com/{domain}/.well-known/openid-configuration"
            )
            if resp.status_code != 200:
                raise HTTPException(404, f"No Microsoft 365 tenant found for '{domain}'")

            data = resp.json()
            # Extract tenant ID from the issuer URL
            issuer = data.get("issuer", "")
            # issuer looks like: https://sts.windows.net/{tenant-id}/
            match = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", issuer)
            if not match:
                raise HTTPException(404, f"Could not resolve tenant ID for '{domain}'")

            return {"tenant_id": match.group(0), "domain": domain}
    except httpx.HTTPError:
        raise HTTPException(502, f"Failed to reach Microsoft for domain '{domain}'")


# ── Request/Response schemas ────────────────────────────────


class ConnectTenantRequest(BaseModel):
    entra_tenant_id: str
    display_name: str = ""


class TenantResponse(BaseModel):
    id: str
    entra_tenant_id: str
    display_name: str
    consent_status: str  # pending | active | consent_denied | revoked
    consent_requested_at: datetime | None = None
    consented_at: datetime | None = None
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
            consent_requested_at=tenant.consent_requested_at,
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
    settings: Settings = Depends(get_settings),
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

    now = datetime.now(UTC)
    tenant = CustomerTenant(
        msp_tenant_id=msp_id,
        entra_tenant_id=body.entra_tenant_id,
        display_name=body.display_name or body.entra_tenant_id,
        consent_status="pending",
        consent_requested_at=now,
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

    # Build admin consent URL with HMAC-signed state to prevent cross-MSP claim
    import hashlib
    import hmac
    state_payload = str(tenant.id)
    state_sig = hmac.new(
        settings.session_secret.encode(), state_payload.encode(), hashlib.sha256
    ).hexdigest()[:16]
    state = f"{state_payload}:{state_sig}"

    consent_url = (
        f"https://login.microsoftonline.com/{body.entra_tenant_id}/adminconsent"
        f"?client_id={settings.azure_client_id}"
        f"&redirect_uri={settings.consent_redirect_uri}"
        f"&state={state}"
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
        consent_requested_at=tenant.consent_requested_at,
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
