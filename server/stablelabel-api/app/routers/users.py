"""User and tenant access management routes.

Part of the Security pane. Admins can view all users, manage tenant assignments.
Users appear via JIT provisioning on first sign-in — no creation endpoint needed.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import require_role
from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant, User, UserTenantAccess

router = APIRouter(prefix="/security/users", tags=["security"])


# ── Response schemas ────────────────────────────────────────


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    first_seen: str
    last_seen: str
    tenant_count: int = 0

    model_config = {"from_attributes": True}


class TenantAccessResponse(BaseModel):
    customer_tenant_id: str
    display_name: str
    entra_tenant_id: str
    granted_at: str
    granted_by: str


class GrantAccessRequest(BaseModel):
    customer_tenant_ids: list[str]


# ── Routes ──────────────────────────────────────────────────


@router.get("", response_model=list[UserResponse])
async def list_users(
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> list[UserResponse]:
    """List all users who have signed in for this MSP."""
    stmt = (
        select(
            User,
            func.count(UserTenantAccess.id).label("tenant_count"),
        )
        .outerjoin(UserTenantAccess, UserTenantAccess.user_id == User.id)
        .where(User.msp_tenant_id == uuid.UUID(user.msp_tenant_id))
        .group_by(User.id)
        .order_by(User.display_name)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        UserResponse(
            id=str(u.id),
            email=u.email,
            display_name=u.display_name,
            role=u.role,
            first_seen=u.first_seen.isoformat(),
            last_seen=u.last_seen.isoformat(),
            tenant_count=count,
        )
        for u, count in rows
    ]


@router.get("/{user_id}/tenants", response_model=list[TenantAccessResponse])
async def list_user_tenant_access(
    user_id: str,
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> list[TenantAccessResponse]:
    """List which customer tenants a user has access to."""
    # Verify user belongs to same MSP
    stmt = select(User).where(
        User.id == uuid.UUID(user_id),
        User.msp_tenant_id == uuid.UUID(user.msp_tenant_id),
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "User not found")

    stmt = (
        select(UserTenantAccess, CustomerTenant)
        .join(CustomerTenant, UserTenantAccess.customer_tenant_id == CustomerTenant.id)
        .where(UserTenantAccess.user_id == uuid.UUID(user_id))
        .order_by(CustomerTenant.display_name)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        TenantAccessResponse(
            customer_tenant_id=str(access.customer_tenant_id),
            display_name=tenant.display_name,
            entra_tenant_id=tenant.entra_tenant_id,
            granted_at=access.created_at.isoformat(),
            granted_by=access.created_by,
        )
        for access, tenant in rows
    ]


@router.put("/{user_id}/tenants", response_model=list[TenantAccessResponse])
async def set_user_tenant_access(
    user_id: str,
    body: GrantAccessRequest,
    user: CurrentUser = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_session),
) -> list[TenantAccessResponse]:
    """Replace a user's tenant access with the given list.

    This is an idempotent PUT — the provided list becomes the full set of
    tenant assignments. Tenants not in the list are revoked.
    """
    target_user_id = uuid.UUID(user_id)
    msp_id = uuid.UUID(user.msp_tenant_id)

    # Verify target user belongs to same MSP
    stmt = select(User).where(User.id == target_user_id, User.msp_tenant_id == msp_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(404, "User not found")

    if target_user.role == "Admin":
        raise HTTPException(400, "Admins have implicit access to all tenants")

    # Validate all tenant IDs belong to this MSP
    requested_ids = {uuid.UUID(tid) for tid in body.customer_tenant_ids}
    if requested_ids:
        stmt = select(CustomerTenant.id).where(
            CustomerTenant.id.in_(requested_ids),
            CustomerTenant.msp_tenant_id == msp_id,
        )
        result = await db.execute(stmt)
        valid_ids = {row[0] for row in result.all()}
        invalid = requested_ids - valid_ids
        if invalid:
            raise HTTPException(400, f"Invalid tenant IDs: {[str(i) for i in invalid]}")

    # Get current access
    stmt = select(UserTenantAccess).where(UserTenantAccess.user_id == target_user_id)
    result = await db.execute(stmt)
    current_access = {a.customer_tenant_id: a for a in result.scalars().all()}

    current_ids = set(current_access.keys())
    to_add = requested_ids - current_ids
    to_remove = current_ids - requested_ids

    # Remove revoked access
    for tid in to_remove:
        await db.delete(current_access[tid])
        db.add(AuditEvent(
            msp_tenant_id=msp_id,
            customer_tenant_id=tid,
            actor_id=uuid.UUID(user.id),
            event_type="access.revoked",
            extra={"user_email": target_user.email},
        ))

    # Add new access
    for tid in to_add:
        db.add(UserTenantAccess(
            user_id=target_user_id,
            customer_tenant_id=tid,
            created_by=user.email,
        ))
        db.add(AuditEvent(
            msp_tenant_id=msp_id,
            customer_tenant_id=tid,
            actor_id=uuid.UUID(user.id),
            event_type="access.granted",
            extra={"user_email": target_user.email},
        ))

    await db.commit()

    # Return the updated access list
    return await list_user_tenant_access(user_id, user, db)
