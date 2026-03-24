"""Integration tests for the reports router (/tenants/{id}/reports).

ReportingService is mocked — auth and tenant access are tested for real.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_reporting_service
from tests.conftest import (
    CUSTOMER_TENANT_ID,
    OPERATOR_USER,
    VIEWER_USER,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)


def _mock_reporting_service():
    mock = AsyncMock()
    mock.job_summary = AsyncMock(return_value=[{"day": "2026-03-20", "total": 10}])
    mock.entity_detections = AsyncMock(return_value=[{"entity": "SSN", "count": 5}])
    mock.label_distribution = AsyncMock(return_value=[{"label": "Confidential", "count": 20}])
    mock.throughput_stats = AsyncMock(return_value=[{"files_per_second": 3.5}])
    mock.tenant_overview = AsyncMock(return_value={"total_jobs": 42, "total_files": 1000})
    return mock


def _overrides(reporting=None):
    o = {}
    if reporting:
        o[get_reporting_service] = lambda: reporting
    return o


@pytest.mark.asyncio
async def test_job_summary(db_session: AsyncSession):
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/summary")
    assert resp.status_code == 200
    assert resp.json()[0]["total"] == 10
    svc.job_summary.assert_awaited_once()


@pytest.mark.asyncio
async def test_entity_detections(db_session: AsyncSession):
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/detections")
    assert resp.status_code == 200
    assert resp.json()[0]["entity"] == "SSN"


@pytest.mark.asyncio
async def test_label_distribution(db_session: AsyncSession):
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/labels")
    assert resp.status_code == 200
    assert resp.json()[0]["label"] == "Confidential"


@pytest.mark.asyncio
async def test_throughput_stats(db_session: AsyncSession):
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/throughput")
    assert resp.status_code == 200
    assert resp.json()[0]["files_per_second"] == 3.5


@pytest.mark.asyncio
async def test_tenant_overview(db_session: AsyncSession):
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_jobs"] == 42
    assert data["total_files"] == 1000


@pytest.mark.asyncio
async def test_summary_custom_days(db_session: AsyncSession):
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/summary?days=7")
    assert resp.status_code == 200
    # Verify the days parameter was passed through
    call_kwargs = svc.job_summary.call_args
    assert call_kwargs.kwargs["days"] == 7


@pytest.mark.asyncio
async def test_throughput_days_out_of_range(db_session: AsyncSession):
    """Throughput max is 90 days — 91 should be rejected."""
    svc = _mock_reporting_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(reporting=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/reports/throughput?days=91")
    assert resp.status_code == 422  # FastAPI validation error
