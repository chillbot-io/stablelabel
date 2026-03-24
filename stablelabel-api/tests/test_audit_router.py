"""Integration tests for the audit log router (/security/audit).

Tests real DB queries against TimescaleDB — no mocking needed since
audit.py only reads from the database.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent
from tests.conftest import (
    ADMIN_USER,
    ADMIN_USER_ID,
    CUSTOMER_TENANT_ID,
    MSP_TENANT_ID,
    VIEWER_USER,
    _build_app,
)


async def _insert_audit_events(session: AsyncSession, count: int = 5) -> list[uuid.UUID]:
    """Insert audit events and return their IDs."""
    ids = []
    for i in range(count):
        event = AuditEvent(
            msp_tenant_id=MSP_TENANT_ID,
            customer_tenant_id=CUSTOMER_TENANT_ID,
            actor_id=ADMIN_USER_ID,
            event_type="label.applied" if i % 2 == 0 else "job.created",
            target_file=f"file_{i}.docx",
        )
        session.add(event)
        ids.append(event.id)
    await session.flush()
    return ids


@pytest.fixture()
async def audit_admin_client(db_session: AsyncSession):
    """Admin client with audit events pre-seeded."""
    await _insert_audit_events(db_session, count=5)
    app = _build_app(ADMIN_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_list_audit_events(audit_admin_client: httpx.AsyncClient):
    resp = await audit_admin_client.get("/security/audit")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 5
    assert len(data["items"]) >= 5
    assert data["page"] == 1
    assert data["page_size"] == 50


@pytest.mark.asyncio
async def test_audit_pagination(audit_admin_client: httpx.AsyncClient):
    resp = await audit_admin_client.get("/security/audit?page=1&page_size=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total"] >= 5


@pytest.mark.asyncio
async def test_audit_filter_by_event_type(audit_admin_client: httpx.AsyncClient):
    resp = await audit_admin_client.get("/security/audit?event_type=label.applied")
    assert resp.status_code == 200
    data = resp.json()
    assert all(e["event_type"] == "label.applied" for e in data["items"])
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_audit_filter_by_customer_tenant(audit_admin_client: httpx.AsyncClient):
    ct = str(CUSTOMER_TENANT_ID)
    resp = await audit_admin_client.get(f"/security/audit?customer_tenant_id={ct}")
    assert resp.status_code == 200
    data = resp.json()
    assert all(e["customer_tenant_id"] == ct for e in data["items"])


@pytest.mark.asyncio
async def test_audit_includes_actor_email(audit_admin_client: httpx.AsyncClient):
    resp = await audit_admin_client.get("/security/audit")
    assert resp.status_code == 200
    data = resp.json()
    # Events created by ADMIN_USER_ID should join to the admin user email
    emails = [e["actor_email"] for e in data["items"] if e["actor_email"]]
    assert "admin@test.example" in emails


@pytest.mark.asyncio
async def test_audit_newest_first(audit_admin_client: httpx.AsyncClient):
    resp = await audit_admin_client.get("/security/audit")
    assert resp.status_code == 200
    items = resp.json()["items"]
    timestamps = [e["created_at"] for e in items]
    assert timestamps == sorted(timestamps, reverse=True)


@pytest.mark.asyncio
async def test_audit_viewer_can_access(db_session: AsyncSession):
    """Viewer role should be able to read audit logs."""
    await _insert_audit_events(db_session, count=1)
    app = _build_app(VIEWER_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get("/security/audit")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_audit_empty_result(db_session: AsyncSession):
    """No events inserted — should return empty page, not error."""
    app = _build_app(ADMIN_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get("/security/audit")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []
