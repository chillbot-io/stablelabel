"""Integration tests for the onboard/consent callback router.

Tests the full consent callback flow with real DB -- no external services
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
from tests.conftest import MSP_TENANT_ID, _build_app

# The session secret set in conftest.py via SL_SESSION_SECRET
SESSION_SECRET = "test-secret-not-for-production"


def _compute_state(ct_id: str, secret: str = SESSION_SECRET) -> str:
    """Create an HMAC-signed state token matching the app's signing logic."""
    sig = hmac.new(secret.encode(), ct_id.encode(), hashlib.sha256).hexdigest()
    return f"{ct_id}:{sig}"


async def _create_pending_tenant(
    db: AsyncSession, entra_tid: str = "pending-entra-tid"
) -> CustomerTenant:
    """Insert a customer tenant with consent_status='pending'."""
    ct = CustomerTenant(
        msp_tenant_id=MSP_TENANT_ID,
        entra_tenant_id=entra_tid,
        display_name="Pending Tenant",
        consent_status="pending",
        consent_requested_at=datetime.now(timezone.utc),
    )
    db.add(ct)
    await db.flush()
    return ct


@pytest.fixture()
async def onboard_client(db_session: AsyncSession) -> httpx.AsyncClient:
    """Unauthenticated client -- consent callback has no auth dependency."""
    app = _build_app(None, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── Test: successful consent activates the tenant ─────────────────────


@pytest.mark.asyncio
async def test_consent_granted_activates_tenant(
    onboard_client: httpx.AsyncClient,
    db_session: AsyncSession,
):
    tenant = await _create_pending_tenant(db_session)
    state = _compute_state(str(tenant.id))

    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": tenant.entra_tenant_id,
            "admin_consent": "True",
            "state": state,
        },
    )

    assert resp.status_code == 200
    assert "Consent granted" in resp.text

    # Verify tenant was activated in DB
    result = await db_session.execute(
        select(CustomerTenant).where(CustomerTenant.id == tenant.id)
    )
    ct = result.scalar_one()
    assert ct.consent_status == "active"
    assert ct.consented_at is not None


# ── Test: denied consent returns denied HTML ──────────────────────────


@pytest.mark.asyncio
async def test_consent_denied_returns_denied_html(
    onboard_client: httpx.AsyncClient,
):
    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "error": "access_denied",
            "error_description": "Admin declined",
        },
    )

    assert resp.status_code == 200
    assert "Consent denied" in resp.text


# ── Test: denied consent updates pending tenant ───────────────────────


@pytest.mark.asyncio
async def test_consent_denied_updates_pending_tenant(
    onboard_client: httpx.AsyncClient,
    db_session: AsyncSession,
):
    tenant = await _create_pending_tenant(db_session)

    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": tenant.entra_tenant_id,
            "error": "access_denied",
            "error_description": "Admin declined",
        },
    )

    assert resp.status_code == 200
    assert "Consent denied" in resp.text

    result = await db_session.execute(
        select(CustomerTenant).where(CustomerTenant.id == tenant.id)
    )
    ct = result.scalar_one()
    assert ct.consent_status == "consent_denied"


# ── Test: missing tenant param returns 400 ────────────────────────────


@pytest.mark.asyncio
async def test_missing_tenant_param_returns_400(
    onboard_client: httpx.AsyncClient,
):
    resp = await onboard_client.get(
        "/onboard/callback",
        params={"admin_consent": "True"},
    )

    assert resp.status_code == 400
    assert "not found" in resp.text.lower()


# ── Test: invalid state signature returns 400 ─────────────────────────


@pytest.mark.asyncio
async def test_invalid_state_signature_returns_400(
    onboard_client: httpx.AsyncClient,
    db_session: AsyncSession,
):
    tenant = await _create_pending_tenant(db_session)
    bad_state = f"{tenant.id}:invalid_signature_here"

    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": tenant.entra_tenant_id,
            "admin_consent": "True",
            "state": bad_state,
        },
    )

    assert resp.status_code == 400
    assert "not found" in resp.text.lower()


# ── Test: missing state returns 400 ───────────────────────────────────


@pytest.mark.asyncio
async def test_missing_state_returns_400(
    onboard_client: httpx.AsyncClient,
    db_session: AsyncSession,
):
    tenant = await _create_pending_tenant(db_session)

    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": tenant.entra_tenant_id,
            "admin_consent": "True",
            # no state param
        },
    )

    assert resp.status_code == 400


# ── Test: no matching pending tenant returns 400 ──────────────────────


@pytest.mark.asyncio
async def test_no_matching_pending_tenant_returns_400(
    onboard_client: httpx.AsyncClient,
):
    fake_id = str(uuid.uuid4())
    state = _compute_state(fake_id)

    resp = await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": "nonexistent-entra-tid",
            "admin_consent": "True",
            "state": state,
        },
    )

    assert resp.status_code == 400


# ── Test: successful consent creates audit event ──────────────────────


@pytest.mark.asyncio
async def test_consent_creates_audit_event(
    onboard_client: httpx.AsyncClient,
    db_session: AsyncSession,
):
    tenant = await _create_pending_tenant(db_session)
    state = _compute_state(str(tenant.id))

    await onboard_client.get(
        "/onboard/callback",
        params={
            "tenant": tenant.entra_tenant_id,
            "admin_consent": "True",
            "state": state,
        },
    )

    result = await db_session.execute(
        select(AuditEvent).where(
            AuditEvent.event_type == "tenant.consent_confirmed",
            AuditEvent.customer_tenant_id == tenant.id,
        )
    )
    event = result.scalar_one_or_none()
    assert event is not None
