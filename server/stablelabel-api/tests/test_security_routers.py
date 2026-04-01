"""Integration tests for security-pane routers: tenants and users.

Covers endpoints NOT already tested in test_api_integration.py:
  - Tenant domain resolution, consent confirmation, disconnect, role enforcement
  - User tenant access listing, setting, role enforcement, error cases
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import (
    ADMIN_USER,
    ADMIN_USER_ID,
    CUSTOMER_TENANT_ID,
    MSP_TENANT_ID,
    OPERATOR_USER,
    OPERATOR_USER_ID,
    VIEWER_USER,
    VIEWER_USER_ID,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)


# ---------------------------------------------------------------------------
# Helper: build a test client with optional service overrides
# ---------------------------------------------------------------------------

def _client(user, session, service_overrides=None) -> httpx.AsyncClient:
    app = _build_app(user, session, service_overrides=service_overrides)
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


# ===========================================================================
# TENANT ROUTER — resolve domain
# ===========================================================================


FAKE_TENANT_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_resolve_domain_success(db_session: AsyncSession):
    """GET /security/tenants/resolve/{domain} returns tenant_id on success."""
    oidc_response = httpx.Response(
        200,
        json={
            "issuer": f"https://sts.windows.net/{FAKE_TENANT_UUID}/",
            "token_endpoint": "https://example.com/token",
        },
    )

    mock_client = AsyncMock()
    mock_client.get.return_value = oidc_response
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async with _client(ADMIN_USER, db_session) as c:
        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = await c.get("/security/tenants/resolve/contoso.com")

    assert resp.status_code == 200
    data = resp.json()
    assert data["tenant_id"] == FAKE_TENANT_UUID
    assert data["domain"] == "contoso.com"


@pytest.mark.asyncio
async def test_resolve_domain_invalid_format(db_session: AsyncSession):
    """Invalid domain format returns 400."""
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.get("/security/tenants/resolve/-invalid")

    assert resp.status_code == 400
    assert "Invalid domain" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_resolve_domain_not_found(db_session: AsyncSession):
    """Non-M365 domain returns 404."""
    oidc_response = httpx.Response(404)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=oidc_response):
        async with _client(ADMIN_USER, db_session) as c:
            resp = await c.get("/security/tenants/resolve/unknown-domain.org")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_resolve_domain_no_tenant_id_in_issuer(db_session: AsyncSession):
    """Issuer without UUID returns 404."""
    oidc_response = httpx.Response(
        200,
        json={"issuer": "https://sts.windows.net/no-uuid-here/"},
    )

    mock_client = AsyncMock()
    mock_client.get.return_value = oidc_response
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async with _client(ADMIN_USER, db_session) as c:
        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = await c.get("/security/tenants/resolve/example.com")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_resolve_domain_http_error(db_session: AsyncSession):
    """Network error reaching Microsoft returns 502."""
    mock_client = AsyncMock()
    mock_client.get.side_effect = httpx.ConnectError("connection failed")
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async with _client(ADMIN_USER, db_session) as c:
        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = await c.get("/security/tenants/resolve/contoso.com")

    assert resp.status_code == 502


# ===========================================================================
# TENANT ROUTER — confirm consent (PATCH)
# ===========================================================================


@pytest.mark.asyncio
async def test_confirm_consent(db_session: AsyncSession):
    """PATCH /security/tenants/{id}/consent sets status to active."""
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.patch(f"/security/tenants/{CT}/consent")

    assert resp.status_code == 200
    data = resp.json()
    assert data["consent_status"] == "active"
    assert data["consented_at"] is not None
    assert data["id"] == CT


@pytest.mark.asyncio
async def test_confirm_consent_not_found(db_session: AsyncSession):
    """PATCH consent on nonexistent tenant returns 404."""
    fake_id = str(uuid.uuid4())
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.patch(f"/security/tenants/{fake_id}/consent")

    assert resp.status_code == 404


# ===========================================================================
# TENANT ROUTER — disconnect (DELETE)
# ===========================================================================


@pytest.mark.asyncio
async def test_disconnect_tenant(db_session: AsyncSession):
    """DELETE /security/tenants/{id} removes the tenant (204)."""
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.delete(f"/security/tenants/{CT}")
        assert resp.status_code == 204

        # Verify it's gone
        list_resp = await c.get("/security/tenants")
        tenant_ids = [t["id"] for t in list_resp.json()]
        assert CT not in tenant_ids


@pytest.mark.asyncio
async def test_disconnect_nonexistent_tenant(db_session: AsyncSession):
    """DELETE on a nonexistent tenant returns 404."""
    fake_id = str(uuid.uuid4())
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.delete(f"/security/tenants/{fake_id}")

    assert resp.status_code == 404


# ===========================================================================
# TENANT ROUTER — role enforcement
# ===========================================================================


@pytest.mark.asyncio
async def test_viewer_cannot_connect_tenant(db_session: AsyncSession):
    """Viewer role is blocked from POST /security/tenants."""
    async with _client(VIEWER_USER, db_session) as c:
        resp = await c.post(
            "/security/tenants",
            json={"entra_tenant_id": "some-tid", "display_name": "X"},
        )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_operator_cannot_connect_tenant(db_session: AsyncSession):
    """Operator role is blocked from POST /security/tenants."""
    async with _client(OPERATOR_USER, db_session) as c:
        resp = await c.post(
            "/security/tenants",
            json={"entra_tenant_id": "some-tid", "display_name": "X"},
        )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_disconnect_tenant(db_session: AsyncSession):
    """Viewer role is blocked from DELETE /security/tenants/{id}."""
    async with _client(VIEWER_USER, db_session) as c:
        resp = await c.delete(f"/security/tenants/{CT}")

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_operator_cannot_disconnect_tenant(db_session: AsyncSession):
    """Operator role is blocked from DELETE /security/tenants/{id}."""
    async with _client(OPERATOR_USER, db_session) as c:
        resp = await c.delete(f"/security/tenants/{CT}")

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_resolve_domain(db_session: AsyncSession):
    """Viewer role is blocked from GET /security/tenants/resolve/{domain}."""
    async with _client(VIEWER_USER, db_session) as c:
        resp = await c.get("/security/tenants/resolve/contoso.com")

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_operator_cannot_confirm_consent(db_session: AsyncSession):
    """Operator role is blocked from PATCH /security/tenants/{id}/consent."""
    async with _client(OPERATOR_USER, db_session) as c:
        resp = await c.patch(f"/security/tenants/{CT}/consent")

    assert resp.status_code == 403


# ===========================================================================
# USER ROUTER — list user tenant access
# ===========================================================================


@pytest.mark.asyncio
async def test_list_user_tenant_access(db_session: AsyncSession):
    """GET /security/users/{id}/tenants lists assigned tenants."""
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.get(f"/security/users/{OPERATOR_USER_ID}/tenants")

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    tenant_ids = [t["customer_tenant_id"] for t in data]
    assert CT in tenant_ids
    # Check response shape
    assert "display_name" in data[0]
    assert "entra_tenant_id" in data[0]
    assert "granted_at" in data[0]
    assert "granted_by" in data[0]


@pytest.mark.asyncio
async def test_list_user_tenant_access_not_found(db_session: AsyncSession):
    """GET tenant access for nonexistent user returns 404."""
    fake_id = str(uuid.uuid4())
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.get(f"/security/users/{fake_id}/tenants")

    assert resp.status_code == 404


# ===========================================================================
# USER ROUTER — set user tenant access (PUT)
# ===========================================================================


@pytest.mark.asyncio
async def test_set_user_tenant_access(db_session: AsyncSession):
    """PUT /security/users/{id}/tenants replaces the tenant access list."""
    async with _client(ADMIN_USER, db_session) as c:
        # Set access to the existing customer tenant
        resp = await c.put(
            f"/security/users/{OPERATOR_USER_ID}/tenants",
            json={"customer_tenant_ids": [CT]},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["customer_tenant_id"] == CT


@pytest.mark.asyncio
async def test_set_user_tenant_access_empty_list(db_session: AsyncSession):
    """PUT with empty list revokes all tenant access."""
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.put(
            f"/security/users/{OPERATOR_USER_ID}/tenants",
            json={"customer_tenant_ids": []},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data == []


@pytest.mark.asyncio
async def test_set_tenant_access_nonexistent_user(db_session: AsyncSession):
    """PUT tenant access for a nonexistent user returns 404."""
    fake_id = str(uuid.uuid4())
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.put(
            f"/security/users/{fake_id}/tenants",
            json={"customer_tenant_ids": [CT]},
        )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_set_tenant_access_nonexistent_tenant(db_session: AsyncSession):
    """PUT with an invalid tenant ID returns 400."""
    fake_tenant = str(uuid.uuid4())
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.put(
            f"/security/users/{OPERATOR_USER_ID}/tenants",
            json={"customer_tenant_ids": [fake_tenant]},
        )

    assert resp.status_code == 400
    assert "Invalid tenant IDs" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_set_tenant_access_admin_target_rejected(db_session: AsyncSession):
    """Cannot set tenant access for an Admin user (implicit access)."""
    async with _client(ADMIN_USER, db_session) as c:
        resp = await c.put(
            f"/security/users/{ADMIN_USER_ID}/tenants",
            json={"customer_tenant_ids": [CT]},
        )

    assert resp.status_code == 400
    assert "implicit access" in resp.json()["detail"].lower()


# ===========================================================================
# USER ROUTER — role enforcement
# ===========================================================================


@pytest.mark.asyncio
async def test_viewer_cannot_set_tenant_access(db_session: AsyncSession):
    """Viewer role is blocked from PUT /security/users/{id}/tenants."""
    async with _client(VIEWER_USER, db_session) as c:
        resp = await c.put(
            f"/security/users/{OPERATOR_USER_ID}/tenants",
            json={"customer_tenant_ids": [CT]},
        )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_operator_cannot_set_tenant_access(db_session: AsyncSession):
    """Operator role is blocked from PUT /security/users/{id}/tenants."""
    async with _client(OPERATOR_USER, db_session) as c:
        resp = await c.put(
            f"/security/users/{OPERATOR_USER_ID}/tenants",
            json={"customer_tenant_ids": [CT]},
        )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_list_user_tenant_access(db_session: AsyncSession):
    """Viewer role is blocked from GET /security/users/{id}/tenants."""
    async with _client(VIEWER_USER, db_session) as c:
        resp = await c.get(f"/security/users/{OPERATOR_USER_ID}/tenants")

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_operator_cannot_list_user_tenant_access(db_session: AsyncSession):
    """Operator role is blocked from GET /security/users/{id}/tenants."""
    async with _client(OPERATOR_USER, db_session) as c:
        resp = await c.get(f"/security/users/{OPERATOR_USER_ID}/tenants")

    assert resp.status_code == 403
