"""Reports routes — DuckDB-powered analytical queries for dashboards.

All endpoints return JSON data suitable for charting libraries.
PDF/CSV export can be added later by wrapping these same queries.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.dependencies import get_reporting_service
from app.services.reporting import ReportingService

router = APIRouter(prefix="/tenants/{customer_tenant_id}/reports", tags=["reports"])


@router.get("/summary")
async def job_summary(
    customer_tenant_id: str,
    days: int = Query(30, ge=1, le=365),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
    reporting: ReportingService = Depends(get_reporting_service),
) -> list[dict[str, Any]]:
    """Job execution summary by day and status."""
    await check_tenant_access(user, customer_tenant_id, db)
    return await reporting.job_summary(uuid.UUID(customer_tenant_id), days)


@router.get("/detections")
async def entity_detections(
    customer_tenant_id: str,
    days: int = Query(30, ge=1, le=365),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
    reporting: ReportingService = Depends(get_reporting_service),
) -> list[dict[str, Any]]:
    """PII/PCI entity detection trends over time."""
    await check_tenant_access(user, customer_tenant_id, db)
    return await reporting.entity_detections(uuid.UUID(customer_tenant_id), days)


@router.get("/labels")
async def label_distribution(
    customer_tenant_id: str,
    days: int = Query(30, ge=1, le=365),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
    reporting: ReportingService = Depends(get_reporting_service),
) -> list[dict[str, Any]]:
    """Label application distribution (which labels were applied how often)."""
    await check_tenant_access(user, customer_tenant_id, db)
    return await reporting.label_distribution(uuid.UUID(customer_tenant_id), days)


@router.get("/throughput")
async def throughput_stats(
    customer_tenant_id: str,
    days: int = Query(7, ge=1, le=90),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
    reporting: ReportingService = Depends(get_reporting_service),
) -> list[dict[str, Any]]:
    """Throughput metrics — files/sec, batch timing, error rates."""
    await check_tenant_access(user, customer_tenant_id, db)
    return await reporting.throughput_stats(uuid.UUID(customer_tenant_id), days)


@router.get("/overview")
async def tenant_overview(
    customer_tenant_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
    reporting: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """High-level tenant dashboard — total jobs, files labelled, detections."""
    await check_tenant_access(user, customer_tenant_id, db)
    return await reporting.tenant_overview(uuid.UUID(customer_tenant_id))
