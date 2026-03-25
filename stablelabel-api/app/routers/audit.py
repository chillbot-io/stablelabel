"""Audit log routes — immutable event log for the Security pane."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import require_role
from app.db.base import get_session
from app.db.models import AuditEvent, User, UserTenantAccess

router = APIRouter(prefix="/security/audit", tags=["security"])


class AuditEventResponse(BaseModel):
    id: str
    event_type: str
    actor_email: str | None = None
    customer_tenant_id: str | None = None
    job_id: str | None = None
    target_file: str | None = None
    target_site: str | None = None
    label_applied: str | None = None
    previous_label: str | None = None
    extra: dict | None = None
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditEventResponse]
    total: int
    page: int
    page_size: int


@router.get("", response_model=AuditPage)
async def list_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(None),
    customer_tenant_id: str | None = Query(None),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> AuditPage:
    """List audit events for the MSP, newest first. Paginated."""
    msp_id = uuid.UUID(user.msp_tenant_id)

    base = select(AuditEvent, User.email).outerjoin(
        User, AuditEvent.actor_id == User.id
    ).where(AuditEvent.msp_tenant_id == msp_id)

    if event_type:
        base = base.where(AuditEvent.event_type == event_type)
    if customer_tenant_id:
        base = base.where(
            AuditEvent.customer_tenant_id == uuid.UUID(customer_tenant_id)
        )

    # Non-Admin users can only see audit events for tenants they have access to
    if user.role != "Admin":
        accessible_tenants = select(UserTenantAccess.customer_tenant_id).where(
            UserTenantAccess.user_id == uuid.UUID(user.id)
        )
        base = base.where(
            AuditEvent.customer_tenant_id.in_(accessible_tenants)
        )

    # Count
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    stmt = (
        base.order_by(AuditEvent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        AuditEventResponse(
            id=str(event.id),
            event_type=event.event_type,
            actor_email=actor_email,
            customer_tenant_id=str(event.customer_tenant_id) if event.customer_tenant_id else None,
            job_id=str(event.job_id) if event.job_id else None,
            target_file=event.target_file,
            target_site=event.target_site,
            label_applied=event.label_applied,
            previous_label=event.previous_label,
            extra=event.extra,
            created_at=event.created_at,
        )
        for event, actor_email in rows
    ]

    return AuditPage(items=items, total=total, page=page, page_size=page_size)
