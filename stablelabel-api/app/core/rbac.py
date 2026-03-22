"""RBAC authorization — role checks and tenant access control.

Roles (from Entra App Roles, carried in ID token):
  - Admin: all operations, implicit access to all connected tenants
  - Operator: run jobs, apply labels — assigned tenants only
  - Viewer: read-only dashboards and reports — assigned tenants only

Tenant access is stored in user_tenant_access table.
Admins bypass tenant access checks entirely.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser, get_current_user
from app.db.models import UserTenantAccess

ROLE_HIERARCHY: dict[str, int] = {"Admin": 3, "Operator": 2, "Viewer": 1}


def require_role(minimum_role: str):
    """FastAPI dependency factory: reject users below the required role level.

    Usage:
        @router.post("/jobs", dependencies=[Depends(require_role("Operator"))])
        async def create_job(...): ...
    """

    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        user_level = ROLE_HIERARCHY.get(user.role, 0)
        required_level = ROLE_HIERARCHY.get(minimum_role, 0)
        if user_level < required_level:
            raise HTTPException(
                403, f"Role '{user.role}' insufficient — requires '{minimum_role}'"
            )
        return user

    return _check


async def check_tenant_access(
    user: CurrentUser,
    customer_tenant_id: str,
    db: AsyncSession,
) -> None:
    """Raise 403 if a non-Admin user lacks access to the given customer tenant.

    Admins pass unconditionally.  Operators and Viewers need an explicit
    row in user_tenant_access.
    """
    if user.role == "Admin":
        return

    stmt = select(UserTenantAccess).where(
        UserTenantAccess.user_id == uuid.UUID(user.id),
        UserTenantAccess.customer_tenant_id == uuid.UUID(customer_tenant_id),
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none() is None:
        raise HTTPException(403, "No access to this tenant")
