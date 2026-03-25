"""Unit tests for jobs, policies, tenants, and users routers.

Uses FastAPI TestClient with dependency overrides and mocked DB sessions
so no real database or Redis is required.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.entra_auth import CurrentUser, get_current_user
from app.core.job_states import COPY_ALLOWED_FROM, SPECIAL_ACTIONS, VALID_TRANSITIONS
from app.db.base import get_session
from app.dependencies import get_arq_pool, get_settings
from app.routers import jobs, policies, tenants, users

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TENANT_ID = "00000000-0000-0000-0000-000000000010"
JOB_ID = "00000000-0000-0000-0000-000000000020"
POLICY_ID = "00000000-0000-0000-0000-000000000030"
USER_ID_TARGET = "00000000-0000-0000-0000-000000000040"
NOW = datetime(2025, 1, 1, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(role="Admin"):
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000001",
        entra_oid="oid-1",
        msp_tenant_id="00000000-0000-0000-0000-000000000002",
        entra_tenant_id="00000000-0000-0000-0000-000000000003",
        email="admin@example.com",
        display_name="Admin User",
        role=role,
    )


def _mock_job(status="pending", **overrides):
    job = MagicMock()
    job.id = uuid.UUID(JOB_ID)
    job.name = "Test Job"
    job.status = status
    job.config = {"scope": "all"}
    job.total_files = 100
    job.processed_files = 50
    job.failed_files = 2
    job.skipped_files = 3
    job.schedule_cron = None
    job.created_by = uuid.UUID("00000000-0000-0000-0000-000000000001")
    job.created_at = NOW
    job.updated_at = NOW
    job.started_at = None
    job.completed_at = None
    job.source_job_id = None
    job.customer_tenant_id = uuid.UUID(TENANT_ID)
    for k, v in overrides.items():
        setattr(job, k, v)
    return job


def _mock_policy(is_builtin=False, **overrides):
    p = MagicMock()
    p.id = uuid.UUID(POLICY_ID)
    p.name = "Test Policy"
    p.is_builtin = is_builtin
    p.is_enabled = True
    p.rules = {"conditions": []}
    p.target_label_id = "label-1"
    p.priority = 10
    p.customer_tenant_id = uuid.UUID(TENANT_ID)
    p.created_at = NOW
    p.updated_at = NOW
    for k, v in overrides.items():
        setattr(p, k, v)
    return p


def _mock_tenant(**overrides):
    t = MagicMock()
    t.id = uuid.UUID(TENANT_ID)
    t.entra_tenant_id = "00000000-0000-0000-0000-000000000099"
    t.display_name = "Contoso"
    t.consent_status = "active"
    t.consent_requested_at = NOW
    t.consented_at = NOW
    t.created_at = NOW
    t.msp_tenant_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    for k, v in overrides.items():
        setattr(t, k, v)
    return t


def _mock_target_user(role="Operator"):
    u = MagicMock()
    u.id = uuid.UUID(USER_ID_TARGET)
    u.email = "operator@example.com"
    u.display_name = "Op User"
    u.role = role
    u.first_seen = NOW
    u.last_seen = NOW
    u.msp_tenant_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    return u


def make_mock_db_result(items=None, scalar=None):
    result = MagicMock()
    if items is not None:
        result.all.return_value = items
        result.scalars.return_value.all.return_value = items
    if scalar is not None:
        result.scalar_one_or_none.return_value = scalar
        result.scalar.return_value = scalar
    return result


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture()
def mock_arq_pool():
    pool = AsyncMock()
    pool.enqueue_job = AsyncMock(return_value=None)
    pool.publish = AsyncMock(return_value=None)
    return pool


@pytest.fixture(autouse=True)
def mock_tenant_access():
    with patch("app.routers.jobs.check_tenant_access", new_callable=AsyncMock):
        with patch("app.routers.policies.check_tenant_access", new_callable=AsyncMock):
            yield


def _build_app(mock_db, user=None, arq_pool=None, settings=None):
    app = FastAPI()
    app.include_router(jobs.router)
    app.include_router(policies.router)
    app.include_router(policies.sit_router)
    app.include_router(tenants.router)
    app.include_router(users.router)

    if user is None:
        user = _make_user()

    async def _override_user():
        return user

    async def _override_session():
        yield mock_db

    app.dependency_overrides[get_current_user] = _override_user
    app.dependency_overrides[get_session] = _override_session

    if arq_pool is not None:
        app.dependency_overrides[get_arq_pool] = lambda: arq_pool

    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings

    return app


# ===========================================================================
# JOBS ROUTER
# ===========================================================================


class TestListJobs:
    def test_list_jobs(self, mock_db):
        job = _mock_job()
        # First execute: count query; second execute: list query
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=1),
                make_mock_db_result(items=[job]),
            ]
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/tenants/{TENANT_ID}/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["name"] == "Test Job"
        # Verify the response includes expected fields from the serializer
        assert "id" in item
        assert "status" in item
        assert "created_at" in item
        # Verify execute was called twice (count + list queries)
        assert mock_db.execute.call_count == 2


class TestCreateJob:
    def test_create_job(self, mock_db):
        tenant = _mock_tenant(consent_status="active")
        job = _mock_job()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=tenant)
        )

        def do_refresh(obj):
            # Simulate DB defaults that would be set after commit
            for attr in ("id", "status", "total_files",
                         "processed_files", "failed_files", "skipped_files",
                         "created_by", "created_at",
                         "updated_at", "started_at", "completed_at",
                         "source_job_id", "customer_tenant_id"):
                setattr(obj, attr, getattr(job, attr))

        mock_db.refresh = AsyncMock(side_effect=do_refresh)

        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.post(
            f"/tenants/{TENANT_ID}/jobs",
            json={"name": "New Job", "config": {"target_label_id": "test-label"}},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Job"
        assert data["status"] == "pending"


class TestGetJob:
    def test_get_job(self, mock_db):
        job = _mock_job()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=job)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}")
        assert resp.status_code == 200
        assert resp.json()["id"] == JOB_ID


class TestUpdateJob:
    def test_update_pending_job(self, mock_db):
        job = _mock_job(status="pending")
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=job)
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.patch(
            f"/tenants/{TENANT_ID}/jobs/{JOB_ID}",
            json={"name": "Renamed"},
        )
        assert resp.status_code == 200
        assert job.name == "Renamed"

    def test_update_running_job_rejected(self, mock_db):
        job = _mock_job(status="running")
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=job)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.patch(
            f"/tenants/{TENANT_ID}/jobs/{JOB_ID}",
            json={"name": "Renamed"},
        )
        assert resp.status_code == 400


class TestJobActions:
    def test_start_pending_job(self, mock_db, mock_arq_pool):
        job = _mock_job(status="pending")
        # The start action now does: 1) get_job, 2) count active jobs, then proceeds
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=job),    # _get_job
                make_mock_db_result(scalar=0),       # active job count
                make_mock_db_result(scalar=job),     # any additional lookups
            ]
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db, arq_pool=mock_arq_pool)
        client = TestClient(app)
        resp = client.post(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/start")
        assert resp.status_code == 200
        assert job.status == "enumerating"
        mock_arq_pool.enqueue_job.assert_called_once()

    def test_unknown_action_rejected(self, mock_db, mock_arq_pool):
        app = _build_app(mock_db, arq_pool=mock_arq_pool)
        client = TestClient(app)
        resp = client.post(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/unknown_action")
        assert resp.status_code == 400
        assert "Unknown action" in resp.json()["detail"]

    def test_copy_completed_job(self, mock_db, mock_arq_pool):
        job = _mock_job(status="completed")
        new_job = _mock_job(
            name="Test Job (copy)",
            status="pending",
            source_job_id=uuid.UUID(JOB_ID),
        )
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=job)
        )

        def do_refresh(obj):
            for attr in ("id", "name", "status", "config", "total_files",
                         "processed_files", "failed_files", "skipped_files",
                         "schedule_cron", "created_by", "created_at",
                         "updated_at", "started_at", "completed_at",
                         "source_job_id", "customer_tenant_id"):
                setattr(obj, attr, getattr(new_job, attr))

        mock_db.refresh = AsyncMock(side_effect=do_refresh)
        app = _build_app(mock_db, arq_pool=mock_arq_pool)
        client = TestClient(app)
        resp = client.post(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/copy")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_job_id"] == JOB_ID

    def test_copy_pending_job_rejected(self, mock_db, mock_arq_pool):
        job = _mock_job(status="pending")
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=job)
        )
        app = _build_app(mock_db, arq_pool=mock_arq_pool)
        client = TestClient(app)
        resp = client.post(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/copy")
        assert resp.status_code == 409

    def test_pause_running_job(self, mock_db, mock_arq_pool):
        job = _mock_job(status="running")
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=job)
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db, arq_pool=mock_arq_pool)
        client = TestClient(app)
        with patch("app.routers.jobs.send_job_signal", new_callable=AsyncMock):
            resp = client.post(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/pause")
        assert resp.status_code == 200
        assert job.status == "paused"

    def test_resume_paused_job(self, mock_db, mock_arq_pool):
        job = _mock_job(status="paused")
        # First call: _get_job; second call: checkpoint query
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=job),
                make_mock_db_result(scalar=None),  # no checkpoint
            ]
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db, arq_pool=mock_arq_pool)
        client = TestClient(app)
        resp = client.post(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/resume")
        assert resp.status_code == 200
        # No checkpoint -> defaults to "running"
        assert job.status == "running"


class TestCheckpoints:
    def test_list_checkpoints(self, mock_db):
        cp = MagicMock()
        cp.id = uuid.UUID("00000000-0000-0000-0000-000000000050")
        cp.checkpoint_type = "enumeration"
        cp.batch_number = 1
        cp.status = "complete"
        cp.items_processed = 100
        cp.items_failed = 0
        cp.scope_cursor = {"page": 2}
        cp.created_at = NOW

        # First execute: _get_job; second execute: checkpoint list
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=_mock_job()),
                make_mock_db_result(items=[cp]),
            ]
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/checkpoints")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["checkpoint_type"] == "enumeration"


class TestScanResults:
    def test_list_results(self, mock_db):
        sr = MagicMock()
        sr.id = uuid.UUID("00000000-0000-0000-0000-000000000060")
        sr.file_name = "report.docx"
        sr.drive_id = "drive-1"
        sr.item_id = "item-1"
        sr.classification = "PII"
        sr.confidence = 0.95
        sr.label_applied = "Confidential"
        sr.previous_label = None
        sr.outcome = "labelled"
        sr.ts = NOW

        # execute calls: _get_job, count, list
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=_mock_job()),
                make_mock_db_result(scalar=1),
                make_mock_db_result(items=[sr]),
            ]
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/tenants/{TENANT_ID}/jobs/{JOB_ID}/results")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["file_name"] == "report.docx"


# ===========================================================================
# POLICIES ROUTER
# ===========================================================================


class TestListPolicies:
    def test_list_policies(self, mock_db):
        p = _mock_policy()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(items=[p])
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/tenants/{TENANT_ID}/policies")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Policy"


class TestCreatePolicy:
    def test_create_policy(self, mock_db):
        mock_db.execute = AsyncMock()  # not called for create
        added_objects = []
        original_add = mock_db.add

        def capture_add(obj):
            added_objects.append(obj)
            return original_add(obj)

        mock_db.add = capture_add

        def do_refresh(obj):
            # Simulate DB populating server-side defaults
            from datetime import datetime, timezone
            obj.id = POLICY_ID
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
            obj.updated_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        mock_db.refresh = AsyncMock(side_effect=do_refresh)
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.post(
            f"/tenants/{TENANT_ID}/policies",
            json={
                "name": "New Policy",
                "rules": {"conditions": []},
                "target_label_id": "label-1",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        # Verify the router used the submitted values, not mock values
        assert data["name"] == "New Policy"
        assert data["target_label_id"] == "label-1"
        assert data["is_enabled"] is True
        assert data["is_builtin"] is False
        # Verify the object was actually added to the session
        assert len(added_objects) >= 1


class TestGetPolicy:
    def test_get_policy(self, mock_db):
        p = _mock_policy()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=p)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/tenants/{TENANT_ID}/policies/{POLICY_ID}")
        assert resp.status_code == 200
        assert resp.json()["id"] == POLICY_ID


class TestUpdatePolicy:
    def test_update_custom_policy(self, mock_db):
        p = _mock_policy(is_builtin=False)
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=p)
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.patch(
            f"/tenants/{TENANT_ID}/policies/{POLICY_ID}",
            json={"name": "Renamed"},
        )
        assert resp.status_code == 200
        assert p.name == "Renamed"

    def test_update_builtin_only_toggle_enabled(self, mock_db):
        p = _mock_policy(is_builtin=True)
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=p)
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db)
        client = TestClient(app)
        # Toggling is_enabled should work
        resp = client.patch(
            f"/tenants/{TENANT_ID}/policies/{POLICY_ID}",
            json={"is_enabled": False},
        )
        assert resp.status_code == 200
        assert p.is_enabled is False

    def test_update_builtin_name_rejected(self, mock_db):
        p = _mock_policy(is_builtin=True)
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=p)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.patch(
            f"/tenants/{TENANT_ID}/policies/{POLICY_ID}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 400
        assert "Built-in" in resp.json()["detail"]


class TestDeletePolicy:
    def test_delete_custom_policy(self, mock_db):
        p = _mock_policy(is_builtin=False)
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=p)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.delete(f"/tenants/{TENANT_ID}/policies/{POLICY_ID}")
        assert resp.status_code == 204

    def test_delete_builtin_rejected(self, mock_db):
        p = _mock_policy(is_builtin=True)
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=p)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.delete(f"/tenants/{TENANT_ID}/policies/{POLICY_ID}")
        assert resp.status_code == 400
        assert "Built-in" in resp.json()["detail"]


class TestSitCatalog:
    @patch("app.routers.policies.get_sit_catalog", return_value=[{"id": "hipaa", "name": "HIPAA"}])
    def test_list_sit_catalog(self, mock_catalog, mock_db):
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get("/sit-catalog")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("app.routers.policies.get_sit_by_id", return_value={"id": "hipaa", "name": "HIPAA"})
    def test_get_sit(self, mock_get, mock_db):
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get("/sit-catalog/hipaa")
        assert resp.status_code == 200
        assert resp.json()["id"] == "hipaa"


class TestCreateFromSit:
    @patch("app.routers.policies.get_sit_by_id", return_value={
        "id": "hipaa",
        "name": "HIPAA PHI",
        "rules": {"conditions": []},
    })
    def test_create_from_sit(self, mock_get, mock_db):
        p = _mock_policy(name="HIPAA PHI")

        def do_refresh(obj):
            for attr in ("id", "name", "is_builtin", "is_enabled", "rules",
                         "target_label_id", "priority", "customer_tenant_id",
                         "created_at", "updated_at"):
                setattr(obj, attr, getattr(p, attr))

        mock_db.refresh = AsyncMock(side_effect=do_refresh)
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.post(
            f"/tenants/{TENANT_ID}/policies/from-sit",
            json={"sit_id": "hipaa", "target_label_id": "label-1"},
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "HIPAA PHI"


# ===========================================================================
# TENANTS ROUTER
# ===========================================================================


class TestListTenants:
    def test_list_tenants(self, mock_db):
        tenant = _mock_tenant()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(items=[(tenant, 3)])
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get("/security/tenants")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["display_name"] == "Contoso"
        assert data[0]["user_count"] == 3


class TestConnectTenant:
    @patch("app.routers.tenants.seed_builtin_policies", new_callable=AsyncMock)
    def test_connect_tenant(self, mock_seed, mock_db):
        # First execute: duplicate check returns None
        dup_result = MagicMock()
        dup_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=dup_result)

        tenant = _mock_tenant(consent_status="pending")

        def do_refresh(obj):
            for attr in ("id", "entra_tenant_id", "display_name",
                         "consent_status", "consent_requested_at",
                         "consented_at", "created_at", "msp_tenant_id"):
                setattr(obj, attr, getattr(tenant, attr))

        mock_db.refresh = AsyncMock(side_effect=do_refresh)

        mock_settings = MagicMock()
        mock_settings.azure_client_id = "test-client-id"
        mock_settings.consent_redirect_uri = "https://app.example.com/onboard/callback"
        mock_settings.session_secret = "test-secret-key"

        app = _build_app(mock_db, settings=mock_settings)
        client = TestClient(app)
        resp = client.post(
            "/security/tenants",
            json={"entra_tenant_id": "00000000-0000-0000-0000-000000000099", "display_name": "Contoso"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "consent_url" in data
        assert "customer_tenant_id" in data
        assert "test-client-id" in data["consent_url"]
        mock_seed.assert_called_once()

    @patch("app.routers.tenants.seed_builtin_policies", new_callable=AsyncMock)
    def test_connect_duplicate_rejected(self, mock_seed, mock_db):
        existing = _mock_tenant()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=existing)
        )
        mock_settings = MagicMock()
        mock_settings.azure_client_id = "test-client-id"
        mock_settings.consent_redirect_uri = "https://app.example.com/onboard/callback"
        mock_settings.session_secret = "test-secret-key"

        app = _build_app(mock_db, settings=mock_settings)
        client = TestClient(app)
        resp = client.post(
            "/security/tenants",
            json={"entra_tenant_id": "00000000-0000-0000-0000-000000000099"},
        )
        assert resp.status_code == 409


class TestConfirmConsent:
    def test_confirm_consent(self, mock_db):
        tenant = _mock_tenant(consent_status="pending")
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=tenant)
        )
        mock_db.refresh = AsyncMock()
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.patch(f"/security/tenants/{TENANT_ID}/consent")
        assert resp.status_code == 200
        assert tenant.consent_status == "active"


class TestDisconnectTenant:
    def test_disconnect_tenant(self, mock_db):
        tenant = _mock_tenant()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=tenant)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.delete(f"/security/tenants/{TENANT_ID}")
        assert resp.status_code == 204
        mock_db.delete.assert_called_once_with(tenant)

    def test_disconnect_not_found(self, mock_db):
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=result)
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.delete(f"/security/tenants/{TENANT_ID}")
        assert resp.status_code == 404


class TestResolveDomain:
    def test_resolve_domain(self, mock_db):
        fake_tid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "issuer": f"https://sts.windows.net/{fake_tid}/",
        }

        app = _build_app(mock_db)
        client = TestClient(app)
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_response):
            resp = client.get("/security/tenants/resolve/contoso.com")
        assert resp.status_code == 200
        assert resp.json()["tenant_id"] == fake_tid

    def test_resolve_invalid_domain(self, mock_db):
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get("/security/tenants/resolve/-invalid")
        assert resp.status_code == 400


# ===========================================================================
# USERS ROUTER
# ===========================================================================


class TestListUsers:
    def test_list_users(self, mock_db):
        u = _mock_target_user()
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(items=[(u, 2)])
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get("/security/users")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["email"] == "operator@example.com"
        assert data[0]["tenant_count"] == 2


class TestListUserTenants:
    def test_list_user_tenants(self, mock_db):
        access = MagicMock()
        access.customer_tenant_id = uuid.UUID(TENANT_ID)
        access.created_at = NOW
        access.created_by = "admin@example.com"
        tenant = _mock_tenant()

        target_user = _mock_target_user()
        # First execute: user lookup; second execute: access list
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=target_user),
                make_mock_db_result(items=[(access, tenant)]),
            ]
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.get(f"/security/users/{USER_ID_TARGET}/tenants")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["display_name"] == "Contoso"


class TestSetUserTenants:
    def test_set_user_tenants(self, mock_db):
        target_user = _mock_target_user(role="Operator")
        access = MagicMock()
        access.customer_tenant_id = uuid.UUID(TENANT_ID)
        access.created_at = NOW
        access.created_by = "admin@example.com"
        tenant = _mock_tenant()

        # Calls: 1) user lookup, 2) validate tenant IDs, 3) current access,
        # 4) re-list user (for return), 5) re-list access (for return)
        mock_db.execute = AsyncMock(
            side_effect=[
                make_mock_db_result(scalar=target_user),  # user lookup
                make_mock_db_result(items=[(uuid.UUID(TENANT_ID),)]),  # validate tenants
                make_mock_db_result(items=[]),  # current access (empty)
                # list_user_tenant_access called at the end:
                make_mock_db_result(scalar=target_user),  # user lookup
                make_mock_db_result(items=[(access, tenant)]),  # access list
            ]
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.put(
            f"/security/users/{USER_ID_TARGET}/tenants",
            json={"customer_tenant_ids": [TENANT_ID]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1

    def test_set_admin_user_rejected(self, mock_db):
        target_user = _mock_target_user(role="Admin")
        mock_db.execute = AsyncMock(
            return_value=make_mock_db_result(scalar=target_user)
        )
        app = _build_app(mock_db)
        client = TestClient(app)
        resp = client.put(
            f"/security/users/{USER_ID_TARGET}/tenants",
            json={"customer_tenant_ids": [TENANT_ID]},
        )
        assert resp.status_code == 400
        assert "Admin" in resp.json()["detail"]
