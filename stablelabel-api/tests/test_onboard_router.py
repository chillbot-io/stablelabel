"""Integration tests for the onboard/consent callback router.

Tests the full consent callback flow with real DB — no external services
involved since this endpoint only reads/writes CustomerTenant + AuditEvent.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent, CustomerTenant
from tests.conftest import (
    CUSTOMER_TENANT_ID,
    MSP_TENANT_ID,
    _build_app,
)

# The session secret set in conftest.py
SESSION_SECRET = "test-secret-not-for-production"


def _sign_state(customer_tenant_id: str) -> str:
    """Create an HMAC-signed state token matching the app's signing logic."""
    sig = hmac.new(
        SESSION_SECRET.encode(), customer_tenant_id.encode(), hashlib.sha256
    ).hexdigest()
    return f"{customer_tenant_id}:{sig}"


@pytest.fixture()
async def pending_tenant(db_session: AsyncSession) -> CustomerTenant:
    """Create a customer tenant with consent_status='pending'."""
    tenant = CustomerTenant(
        id=uuid.UUID("00000000-0000-0000-0000-000000000099"),
        msp_tenant_id=MSP_TENANT_ID,
        entra_tenant_id="pending-entra-tid",
        display_name="Pending Customer",
        consent_status="pending",
        consent_requested_at=datetime.now(timezone.utc),
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest.fixture()
async def onboard_client(db_session: AsyncSession) -> httpx.AsyncClient:
    """Unauthenticated client — consent callback has no auth."""
    app = _build_app(None, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_consent_granted(
    onboard_client: httpx.AsyncClient,
    pending_tenant: CustomerTenant,
    db_session: AsyncSession,
):
    """Successful consent should activate the tenant."""
    state = _sign_state(str(pending_tenant.id))
    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": pending_tenant.entra_tenant_id,
            "admin_consent": "True",
            "state": state,
        },
    )
    assert resp.status_code == 200
    assert "Consent granted" in resp.text

    # Verify tenant was activated in DB
    await db_session.flush()
    result = await db_session.execute(
        select(CustomerTenant).where(CustomerTenant.id == pending_tenant.id)
    )
    ct = result.scalar_one()
    assert ct.consent_status == "active"
    assert ct.consented_at is not None


@pytest.mark.asyncio
async def test_consent_denied(
    onboard_client: httpx.AsyncClient,
    pending_tenant: CustomerTenant,
    db_session: AsyncSession,
):
    """Denied consent should update status and return denied HTML."""
    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": pending_tenant.entra_tenant_id,
            "error": "access_denied",
            "error_description": "Admin declined",
        },
    )
    assert resp.status_code == 200
    assert "Consent denied" in resp.text

    # Verify tenant was marked as denied
    result = await db_session.execute(
        select(CustomerTenant).where(CustomerTenant.id == pending_tenant.id)
    )
    ct = result.scalar_one()
    assert ct.consent_status == "consent_denied"


@pytest.mark.asyncio
async def test_consent_denied_creates_audit_event(
    onboard_client: httpx.AsyncClient,
    pending_tenant: CustomerTenant,
    db_session: AsyncSession,
):
    """Denied consent should log an audit event."""
    await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": pending_tenant.entra_tenant_id,
            "error": "access_denied",
            "error_description": "Nope",
        },
    )
    result = await db_session.execute(
        select(AuditEvent).where(
            AuditEvent.event_type == "tenant.consent_denied",
            AuditEvent.customer_tenant_id == pending_tenant.id,
        )
    )
    event = result.scalar_one_or_none()
    assert event is not None


@pytest.mark.asyncio
async def test_consent_granted_creates_audit_event(
    onboard_client: httpx.AsyncClient,
    pending_tenant: CustomerTenant,
    db_session: AsyncSession,
):
    """Successful consent should log an audit event."""
    state = _sign_state(str(pending_tenant.id))
    await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": pending_tenant.entra_tenant_id,
            "admin_consent": "True",
            "state": state,
        },
    )
    result = await db_session.execute(
        select(AuditEvent).where(
            AuditEvent.event_type == "tenant.consent_confirmed",
            AuditEvent.customer_tenant_id == pending_tenant.id,
        )
    )
    event = result.scalar_one_or_none()
    assert event is not None


@pytest.mark.asyncio
async def test_missing_tenant_param(onboard_client: httpx.AsyncClient):
    """No tenant parameter should return 400."""
    resp = await onboard_client.get(
        "/onboard/callback", params={"admin_consent": "True"}
    )
    assert resp.status_code == 400
    assert "not found" in resp.text.lower()


@pytest.mark.asyncio
async def test_invalid_state_signature(
    onboard_client: httpx.AsyncClient,
    pending_tenant: CustomerTenant,
):
    """Tampered state token should be rejected."""
    bad_state = f"{pending_tenant.id}:invalid_signature_here"
    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": pending_tenant.entra_tenant_id,
            "admin_consent": "True",
            "state": bad_state,
        },
    )
    assert resp.status_code == 400
    assert "not found" in resp.text.lower()


@pytest.mark.asyncio
async def test_missing_state_token(
    onboard_client: httpx.AsyncClient,
    pending_tenant: CustomerTenant,
):
    """No state token should be rejected (prevents cross-MSP claims)."""
    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": pending_tenant.entra_tenant_id,
            "admin_consent": "True",
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_consent_for_nonexistent_tenant(onboard_client: httpx.AsyncClient):
    """Consent for unknown tenant should return 400."""
    fake_id = str(uuid.uuid4())
    state = _sign_state(fake_id)
    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": "unknown-entra-tid",
            "admin_consent": "True",
            "state": state,
        },
    )
    assert resp.status_code == 400
