"""Shared test fixtures — real TimescaleDB via testcontainers.

Prerequisites: Docker must be running. That's it — testcontainers handles
container lifecycle, port allocation, and cleanup automatically.
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

# Set required env vars before any app imports
os.environ.setdefault("SL_SESSION_SECRET", "test-secret-not-for-production")

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

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
        entra_oid=str(user_id),
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
# Session-scoped containers — started once per test run
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
def pg_container():
    """Start a TimescaleDB container for the entire test session."""
    with PostgresContainer(
        image="timescale/timescaledb:latest-pg16",
        username="test",
        password="test",
        dbname="testdb",
    ) as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container():
    """Start a Redis container for the entire test session."""
    with RedisContainer(image="redis:7-alpine") as redis:
        yield redis


@pytest.fixture(scope="session")
def pg_url(pg_container) -> str:
    """Build an asyncpg connection URL from the running container."""
    host = pg_container.get_container_host_ip()
    port = pg_container.get_exposed_port(5432)
    return f"postgresql+asyncpg://test:test@{host}:{port}/testdb"


@pytest.fixture(scope="session")
def redis_url(redis_container) -> str:
    """Build a Redis URL from the running container."""
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    return f"redis://{host}:{port}/0"


# ---------------------------------------------------------------------------
# Session-scoped engine — run migrations once
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
async def engine(pg_url):
    """Create async engine and apply all Alembic migrations."""
    eng = create_async_engine(pg_url, echo=False, poolclass=NullPool)

    # Run Alembic migrations synchronously using a sync engine
    # (avoids conflict with env.py's async_engine_from_config)
    import asyncio

    from sqlalchemy import create_engine, text

    sync_url = pg_url.replace("+asyncpg", "+psycopg2")

    def _run_migrations():
        sync_engine = create_engine(sync_url)
        with sync_engine.begin() as conn:
            from alembic import command
            from alembic.config import Config

            alembic_cfg = Config("alembic.ini")
            alembic_cfg.attributes["connection"] = conn
            command.upgrade(alembic_cfg, "head")
        sync_engine.dispose()

    await asyncio.to_thread(_run_migrations)

    yield eng
    await eng.dispose()


# ---------------------------------------------------------------------------
# Per-test session with transactional rollback
# ---------------------------------------------------------------------------


@pytest.fixture()
async def db_session(engine) -> AsyncIterator[AsyncSession]:
    """Yield a session wrapped in a transaction that rolls back after each test."""
    async with engine.connect() as conn:
        txn = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)

        await _seed(session)

        yield session

        await session.close()
        await txn.rollback()


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
                entra_oid=str(uid),
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

    await session.flush()


# ---------------------------------------------------------------------------
# FastAPI test clients
# ---------------------------------------------------------------------------


def _build_app(
    current_user: CurrentUser | None,
    session: AsyncSession,
    service_overrides: dict | None = None,
):
    """Build a minimal FastAPI app with dependency overrides.

    Args:
        current_user: If None, requests raise 401 (unauthenticated).
        session: The async DB session to inject.
        service_overrides: Optional dict mapping dependency callables to mocks.
    """
    from fastapi import FastAPI, HTTPException

    from app.core.entra_auth import get_current_user
    from app.db.base import get_session
    from app.routers import (
        audit,
        documents,
        health,
        jobs,
        labels,
        onboard,
        policies,
        reports,
        sites,
        tenants,
        users,
    )

    app = FastAPI()
    for r in (audit, documents, health, jobs, labels, onboard, policies, reports, sites, tenants, users):
        app.include_router(r.router)

    if current_user is not None:
        async def _override_user():
            return current_user
        app.dependency_overrides[get_current_user] = _override_user
    else:
        async def _no_user():
            raise HTTPException(status_code=401, detail="Not authenticated")
        app.dependency_overrides[get_current_user] = _no_user

    async def _override_session():
        yield session

    app.dependency_overrides[get_session] = _override_session

    # Wire up any service mocks (graph client, label service, etc.)
    if service_overrides:
        app.dependency_overrides.update(service_overrides)

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
    """Client with no auth override — routes should reject with 401."""
    app = _build_app(None, db_session)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
