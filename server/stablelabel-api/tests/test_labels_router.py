"""Integration tests for the labels router (/tenants/{id}/labels).

Graph API / LabelService / LabelManagementService are mocked.
Auth, tenant access, and audit event persistence are tested against real DB.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_label_management_service, get_label_service
from app.db.models import AuditEvent
from app.models.label import SensitivityLabel
from tests.conftest import (
    ADMIN_USER,
    CUSTOMER_TENANT_ID,
    OPERATOR_USER,
    VIEWER_USER,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)

SAMPLE_LABELS = [
    SensitivityLabel(
        id="lbl-1", name="Public", display_name="Public", priority=0,
    ),
    SensitivityLabel(
        id="lbl-2", name="Confidential", display_name="Confidential",
        priority=1, has_protection=True,
    ),
]


def _mock_label_service(labels: list[SensitivityLabel] | None = None):
    mock = AsyncMock()
    mock.get_labels = AsyncMock(return_value=labels or SAMPLE_LABELS)
    mock.get_appliable_labels = AsyncMock(return_value=labels or SAMPLE_LABELS)
    mock.get_label = AsyncMock(return_value=(labels or SAMPLE_LABELS)[0])
    return mock


def _mock_label_mgmt_service():
    mock = AsyncMock()
    mock.create_label = AsyncMock(return_value={"id": "new-label-id", "name": "Test"})
    mock.update_label = AsyncMock(return_value={"id": "lbl-1", "name": "Updated"})
    mock.delete_label = AsyncMock(return_value=None)
    return mock


def _service_overrides(label_svc=None, mgmt_svc=None):
    overrides = {}
    if label_svc:
        overrides[get_label_service] = lambda: label_svc
    if mgmt_svc:
        overrides[get_label_management_service] = lambda: mgmt_svc
    return overrides


# ── List labels ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_labels(db_session: AsyncSession):
    svc = _mock_label_service()
    app = _build_app(VIEWER_USER, db_session, _service_overrides(label_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/labels")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Public"
    assert data[1]["has_protection"] is True


@pytest.mark.asyncio
async def test_list_labels_appliable_only(db_session: AsyncSession):
    svc = _mock_label_service()
    app = _build_app(VIEWER_USER, db_session, _service_overrides(label_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/labels?appliable_only=true")
    assert resp.status_code == 200
    svc.get_appliable_labels.assert_awaited_once()


# ── Get single label ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_label(db_session: AsyncSession):
    svc = _mock_label_service()
    app = _build_app(VIEWER_USER, db_session, _service_overrides(label_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/labels/lbl-1")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Public"


# ── Create label ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_label(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        OPERATOR_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/labels",
            json={"name": "Internal", "display_name": "Internal Use"},
        )
    assert resp.status_code == 201
    mgmt.create_label.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_label_writes_audit_event(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        OPERATOR_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        await c.post(f"/tenants/{CT}/labels", json={"name": "Audit Test"})

    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.event_type == "label.created")
    )
    event = result.scalar_one_or_none()
    assert event is not None
    assert event.customer_tenant_id == CUSTOMER_TENANT_ID


@pytest.mark.asyncio
async def test_create_label_viewer_forbidden(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        VIEWER_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(f"/tenants/{CT}/labels", json={"name": "Nope"})
    assert resp.status_code == 403


# ── Update label ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_label(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        OPERATOR_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.patch(
            f"/tenants/{CT}/labels/lbl-1",
            json={"display_name": "Updated Name"},
        )
    assert resp.status_code == 200
    mgmt.update_label.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_label_empty_body_rejected(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        OPERATOR_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.patch(f"/tenants/{CT}/labels/lbl-1", json={})
    assert resp.status_code == 400
    assert "No fields" in resp.json()["detail"]


# ── Delete label ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_label(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        ADMIN_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.delete(f"/tenants/{CT}/labels/lbl-1")
    assert resp.status_code == 204
    mgmt.delete_label.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_label_operator_forbidden(db_session: AsyncSession):
    """Only Admin can delete labels."""
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        OPERATOR_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.delete(f"/tenants/{CT}/labels/lbl-1")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_label_writes_audit_event(db_session: AsyncSession):
    mgmt = _mock_label_mgmt_service()
    app = _build_app(
        ADMIN_USER, db_session,
        _service_overrides(label_svc=_mock_label_service(), mgmt_svc=mgmt),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        await c.delete(f"/tenants/{CT}/labels/lbl-1")

    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.event_type == "label.deleted")
    )
    event = result.scalar_one_or_none()
    assert event is not None
