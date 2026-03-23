"""Sites routes — enumerate SharePoint sites for scope selection in jobs.

Provides a search endpoint so users can pick which sites a job should scan
instead of scanning the entire tenant.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.db.models import CustomerTenant
from app.dependencies import get_graph_client
from app.services.graph_client import GraphClient

router = APIRouter(prefix="/tenants/{customer_tenant_id}/sites", tags=["sites"])


class SiteResponse(BaseModel):
    id: str
    displayName: str
    webUrl: str


@router.get("", response_model=list[SiteResponse])
async def list_sites(
    customer_tenant_id: str,
    search: str = Query("", description="Search term for site name"),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
    graph: GraphClient = Depends(get_graph_client),
) -> list[SiteResponse]:
    """Search SharePoint sites for a customer tenant.

    Used by the job creation UI to let users pick specific sites to scan.
    """
    await check_tenant_access(user, customer_tenant_id, db)

    # Get tenant's Entra ID
    stmt = select(CustomerTenant).where(
        CustomerTenant.id == uuid.UUID(customer_tenant_id)
    )
    result = await db.execute(stmt)
    tenant = result.scalar_one_or_none()
    if not tenant:
        return []

    search_term = search.strip() or "*"
    try:
        sites = await graph.get_all_pages(
            tenant.entra_tenant_id, f"/sites?search={search_term}"
        )
    except Exception:
        return []

    return [
        SiteResponse(
            id=s.get("id", ""),
            displayName=s.get("displayName", s.get("name", "")),
            webUrl=s.get("webUrl", ""),
        )
        for s in sites
        if s.get("id")
    ]
