"""Integration tests for StableLabel API route handlers.

Uses an in-memory SQLite database with SQLAlchemy async to avoid
needing a running Postgres instance.  Builds a minimal FastAPI app
with only the routers under test and overrides auth/DB dependencies.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# Patch jose before any app module can import it (cffi is broken in CI)
# ---------------------------------------------------------------------------
_jose_mock = MagicMock()
sys.modules.setdefault("jose", _jose_mock)
sys.modules.setdefault("jose.jwt", _jose_mock)
sys.modules.setdefault("jose.jwk", _jose_mock)
sys.modules.setdefault("jose.jws", _jose_mock)
sys.modules.setdefault("jose.backends", _jose_mock)

os.environ.setdefault("SL_SESSION_SECRET", "test-secret-not-for-production")

import httpx
from sqlalchemy import String, event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.entra_auth import CurrentUser
from app.db.models import (
    AuditEvent,
    Base,
    CustomerTenant,
    Job,
    MspTenant,
    Policy,
    User,
    UserTenantAccess,
)

# ---------------------------------------------------------------------------
# Shared IDs — deterministic UUIDs for seed data
# ---------------------------------------------------------------------------
MSP_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
CUSTOMER_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
ADMIN_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
OPERATOR_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")
VIEWER_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000012")
ENTRA_TENANT_ID = "aaaa-bbbb-cccc-dddd"


def _make_current_user(
    user_id: uuid.UUID,
    role: str,
    msp_tenant_id: uuid.UUID = MSP_TENANT_ID,
) -> CurrentUser:
    return CurrentUser(
        id=str(user_id),
        entra_oid=f"oid-{user_id}",
        msp_tenant_id=str(msp_tenant_id),
        entra_tenant_id=ENTRA_TENANT_ID,
        email=f"{role.lower()}@test.example",
        display_name=f"Test {role}",
        role=role,
    )


ADMIN_USER = _make_current_user(ADMIN_USER_ID, "Admin")
OPERATOR_USER = _make_current_user(OPERATOR_USER_ID, "Operator")
VIEWER_USER = _make_current_user(VIEWER_USER_ID, "Viewer")


# ---------------------------------------------------------------------------
# SQLite engine (async, in-memory)
# ---------------------------------------------------------------------------

# aiosqlite is required for async sqlite
_engine = create_async_engine(
    "sqlite+aiosqlite://",
    echo=False,
    connect_args={"check_same_thread": False},
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


# Workaround: SQLite does not enforce FKs by default
@event.listens_for(_engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


def _register_sqlite_compilers():
    """Register compilers for PostgreSQL types that SQLite doesn't support."""
    from sqlalchemy import JSON
    from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
    from sqlalchemy.ext.compiler import compiles
    from sqlalchemy.types import TypeDecorator

    @compiles(PG_UUID, "sqlite")
    def _compile_uuid_sqlite(type_, compiler, **kw):
        return "VARCHAR(36)"

    @compiles(PG_JSONB, "sqlite")
    def _compile_jsonb_sqlite(type_, compiler, **kw):
        return "JSON"


# Call at module load so compilers are registered before create_all
_register_sqlite_compilers()


@pytest.fixture()
async def db_session() -> AsyncIterator[AsyncSession]:
    """Create tables, seed data, yield session, then drop everything."""
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with _session_factory() as session:
        await _seed(session)
        yield session

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _seed(session: AsyncSession) -> None:
    """Insert baseline data: MSP tenant, customer tenant, users."""
    now = datetime.now(timezone.utc)

    msp = MspTenant(
        id=MSP_TENANT_ID,
        entra_tenant_id=ENTRA_TENANT_ID,
        display_name="Test MSP",
    )
    session.add(msp)
    await session.flush()

    customer = CustomerTenant(
        id=CUSTOMER_TENANT_ID,
        msp_tenant_id=MSP_TENANT_ID,
        entra_tenant_id="cust-entra-tenant-id",
        display_name="Test Customer",
        consent_status="active",
        consent_requested_at=now,
        consented_at=now,
    )
    session.add(customer)
    await session.flush()

    for uid, role, email in [
        (ADMIN_USER_ID, "Admin", "admin@test.example"),
        (OPERATOR_USER_ID, "Operator", "operator@test.example"),
        (VIEWER_USER_ID, "Viewer", "viewer@test.example"),
    ]:
        session.add(
            User(
                id=uid,
                msp_tenant_id=MSP_TENANT_ID,
                entra_oid=f"oid-{uid}",
                email=email,
                display_name=f"Test {role}",
                role=role,
            )
        )

    await session.flush()

    # Grant Operator and Viewer access to the customer tenant
    for uid in (OPERATOR_USER_ID, VIEWER_USER_ID):
        session.add(
            UserTenantAccess(
                user_id=uid,
                customer_tenant_id=CUSTOMER_TENANT_ID,
                created_by="admin@test.example",
            )
        )

    await session.commit()


def _build_app(
    current_user: CurrentUser,
    session: AsyncSession,
):
    """Build a minimal FastAPI app with dependency overrides."""
    from fastapi import FastAPI

    from app.core.entra_auth import get_current_user
    from app.db.base import get_session
    from app.routers import health, jobs, policies, tenants, users

    app = FastAPI()
    app.include_router(health.router)
    app.include_router(jobs.router)
    app.include_router(policies.router)
    app.include_router(tenants.router)
    app.include_router(users.router)

    async def _override_user():
        return current_user

    async def _override_session():
        yield session

    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_session] = _override_session

    return app


@pytest.fixture()
async def admin_client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    app = _build_app(ADMIN_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def operator_client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    app = _build_app(OPERATOR_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def viewer_client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    app = _build_app(VIEWER_USER, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def unauthenticated_client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    """Client with no auth override — routes should reject with 403."""
    from fastapi import FastAPI, HTTPException

    from app.core.entra_auth import get_current_user
    from app.db.base import get_session
    from app.routers import health, jobs, policies, tenants, users

    app = FastAPI()
    app.include_router(health.router)
    app.include_router(jobs.router)
    app.include_router(policies.router)
    app.include_router(tenants.router)
    app.include_router(users.router)

    async def _no_user():
        raise HTTPException(status_code=401, detail="Not authenticated")

    async def _override_session():
        yield db_session

    app.dependency_overrides[get_current_user] = _no_user
    app.dependency_overrides[get_session] = _override_session

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ===========================================================================
# Tests
# ===========================================================================

CT = str(CUSTOMER_TENANT_ID)


# ── 1. Health ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health(admin_client: httpx.AsyncClient):
    resp = await admin_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ── 2. POST /tenants/{id}/jobs — create job ───────────────────


@pytest.mark.asyncio
async def test_create_job(operator_client: httpx.AsyncClient):
    payload = {"name": "Test labelling job", "config": {"scope": "all"}}
    resp = await operator_client.post(f"/tenants/{CT}/jobs", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test labelling job"
    assert data["status"] == "pending"
    assert data["config"] == {"scope": "all"}
    # UUID should be parseable
    uuid.UUID(data["id"])


# ── 3. GET /tenants/{id}/jobs — list jobs ─────────────────────


@pytest.mark.asyncio
async def test_list_jobs(operator_client: httpx.AsyncClient):
    # Create a job first
    await operator_client.post(
        f"/tenants/{CT}/jobs", json={"name": "Job for listing"}
    )
    resp = await operator_client.get(f"/tenants/{CT}/jobs")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 1
    assert data["page"] == 1


# ── 4. GET /tenants/{id}/jobs/{id} — get single job ──────────


@pytest.mark.asyncio
async def test_get_single_job(operator_client: httpx.AsyncClient):
    create_resp = await operator_client.post(
        f"/tenants/{CT}/jobs", json={"name": "Single job test"}
    )
    job_id = create_resp.json()["id"]

    resp = await operator_client.get(f"/tenants/{CT}/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id
    assert resp.json()["name"] == "Single job test"


# ── 5. POST /tenants/{id}/policies — create policy ───────────


@pytest.mark.asyncio
async def test_create_policy(operator_client: httpx.AsyncClient):
    payload = {
        "name": "PCI policy",
        "rules": {"classifier": "pci", "min_confidence": 0.8},
        "target_label_id": "label-001",
        "priority": 10,
    }
    resp = await operator_client.post(f"/tenants/{CT}/policies", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "PCI policy"
    assert data["target_label_id"] == "label-001"
    assert data["priority"] == 10
    assert data["is_builtin"] is False
    assert data["is_enabled"] is True


# ── 6. GET /tenants/{id}/policies — list policies ────────────


@pytest.mark.asyncio
async def test_list_policies(operator_client: httpx.AsyncClient):
    # Create one first
    await operator_client.post(
        f"/tenants/{CT}/policies",
        json={
            "name": "Policy for listing",
            "rules": {"classifier": "ssn"},
            "target_label_id": "label-002",
        },
    )
    resp = await operator_client.get(f"/tenants/{CT}/policies")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


# ── 7. PATCH /tenants/{id}/policies/{id} — update policy ─────


@pytest.mark.asyncio
async def test_update_policy(operator_client: httpx.AsyncClient):
    create_resp = await operator_client.post(
        f"/tenants/{CT}/policies",
        json={
            "name": "Updatable policy",
            "rules": {"classifier": "pii"},
            "target_label_id": "label-003",
        },
    )
    policy_id = create_resp.json()["id"]

    resp = await operator_client.patch(
        f"/tenants/{CT}/policies/{policy_id}",
        json={"name": "Updated policy name", "priority": 99},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated policy name"
    assert resp.json()["priority"] == 99


# ── 8. DELETE /tenants/{id}/policies/{id} — delete policy ────


@pytest.mark.asyncio
async def test_delete_policy(operator_client: httpx.AsyncClient):
    create_resp = await operator_client.post(
        f"/tenants/{CT}/policies",
        json={
            "name": "Deletable policy",
            "rules": {"classifier": "nhi"},
            "target_label_id": "label-004",
        },
    )
    policy_id = create_resp.json()["id"]

    resp = await operator_client.delete(f"/tenants/{CT}/policies/{policy_id}")
    assert resp.status_code == 204

    # Confirm it's gone
    resp2 = await operator_client.get(f"/tenants/{CT}/policies/{policy_id}")
    assert resp2.status_code == 404


# ── 9. GET /security/tenants — list tenants (Admin only) ─────


@pytest.mark.asyncio
async def test_list_tenants_admin(admin_client: httpx.AsyncClient):
    resp = await admin_client.get("/security/tenants")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["entra_tenant_id"] == "cust-entra-tenant-id"


# ── 10. POST /security/tenants — connect tenant ──────────────


@pytest.mark.asyncio
async def test_connect_tenant(admin_client: httpx.AsyncClient):
    payload = {
        "entra_tenant_id": "new-customer-entra-tid",
        "display_name": "New Customer Org",
    }
    resp = await admin_client.post("/security/tenants", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert "consent_url" in data
    assert "customer_tenant_id" in data
    uuid.UUID(data["customer_tenant_id"])


# ── 11. GET /security/users — list users ─────────────────────


@pytest.mark.asyncio
async def test_list_users(admin_client: httpx.AsyncClient):
    resp = await admin_client.get("/security/users")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    emails = {u["email"] for u in data}
    assert "admin@test.example" in emails
    assert "operator@test.example" in emails
    assert "viewer@test.example" in emails


# ── 12. Auth: Viewer cannot create jobs ───────────────────────


@pytest.mark.asyncio
async def test_viewer_cannot_create_job(viewer_client: httpx.AsyncClient):
    payload = {"name": "Should fail", "config": {}}
    resp = await viewer_client.post(f"/tenants/{CT}/jobs", json=payload)
    assert resp.status_code == 403


# ── 13. Auth: Unauthenticated returns 401 ─────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_returns_401(unauthenticated_client: httpx.AsyncClient):
    resp = await unauthenticated_client.get(f"/tenants/{CT}/jobs")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_cannot_list_tenants(unauthenticated_client: httpx.AsyncClient):
    resp = await unauthenticated_client.get("/security/tenants")
    assert resp.status_code == 401
