"""Unit tests for health, audit, reports, and sites routers.

Uses a lightweight FastAPI test app with dependency overrides so that
no real database, Redis, or external service is required.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.entra_auth import CurrentUser, get_current_user
from app.db.base import get_session
from app.dependencies import get_graph_client, get_reporting_service
from app.routers import audit, health, reports, sites


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TENANT_ID = "00000000-0000-0000-0000-000000000099"


def _make_user(role: str = "Admin") -> CurrentUser:
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000001",
        entra_oid="oid-1",
        msp_tenant_id="00000000-0000-0000-0000-000000000002",
        entra_tenant_id="00000000-0000-0000-0000-000000000003",
        email="test@example.com",
        display_name="Test User",
        role=role,
    )


def _make_audit_row(
    event_type: str = "label_applied",
    customer_tenant_id: uuid.UUID | None = None,
    actor_email: str | None = "actor@example.com",
) -> tuple:
    """Return a (AuditEvent-like, actor_email) tuple matching the query shape."""
    event = SimpleNamespace(
        id=uuid.uuid4(),
        event_type=event_type,
        customer_tenant_id=customer_tenant_id,
        job_id=None,
        target_file="/sites/docs/file.docx",
        target_site="https://contoso.sharepoint.com/sites/docs",
        label_applied="Confidential",
        previous_label=None,
        extra=None,
        created_at=datetime(2026, 3, 20, 12, 0, 0, tzinfo=timezone.utc),
    )
    return (event, actor_email)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_db():
    return AsyncMock()


@pytest.fixture()
def mock_reporting():
    svc = AsyncMock()
    svc.job_summary = AsyncMock(return_value=[{"day": "2026-03-20", "total": 10}])
    svc.entity_detections = AsyncMock(return_value=[{"entity": "SSN", "count": 5}])
    svc.label_distribution = AsyncMock(return_value=[{"label": "Confidential", "count": 20}])
    svc.throughput_stats = AsyncMock(return_value=[{"files_per_second": 3.5}])
    svc.tenant_overview = AsyncMock(return_value={"total_jobs": 42, "files_labelled": 1234})
    return svc


@pytest.fixture()
def mock_graph():
    return AsyncMock()


@pytest.fixture()
def client(mock_db, mock_reporting, mock_graph):
    """Build a test app with all four routers and overridden dependencies."""
    app = FastAPI()
    app.include_router(health.router)
    app.include_router(audit.router)
    app.include_router(reports.router)
    app.include_router(sites.router)

    user = _make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: mock_db
    app.dependency_overrides[get_reporting_service] = lambda: mock_reporting
    app.dependency_overrides[get_graph_client] = lambda: mock_graph

    with patch("app.routers.reports.check_tenant_access", new_callable=AsyncMock), \
         patch("app.routers.sites.check_tenant_access", new_callable=AsyncMock):
        with TestClient(app) as c:
            yield c


# ===================================================================
# health.py
# ===================================================================


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ===================================================================
# audit.py
# ===================================================================


class TestAudit:
    def test_list_audit_events(self, client, mock_db):
        rows = [_make_audit_row() for _ in range(3)]
        # First execute call -> count query, second -> data query
        count_result = MagicMock()
        count_result.scalar.return_value = 3

        data_result = MagicMock()
        data_result.all.return_value = rows

        mock_db.execute = AsyncMock(side_effect=[count_result, data_result])

        resp = client.get("/security/audit")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert len(body["items"]) == 3
        assert body["page"] == 1
        assert body["page_size"] == 50

    def test_audit_with_event_type_filter(self, client, mock_db):
        rows = [_make_audit_row(event_type="job_started")]
        count_result = MagicMock()
        count_result.scalar.return_value = 1

        data_result = MagicMock()
        data_result.all.return_value = rows

        mock_db.execute = AsyncMock(side_effect=[count_result, data_result])

        resp = client.get("/security/audit", params={"event_type": "job_started"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["event_type"] == "job_started"

    def test_audit_with_customer_tenant_filter(self, client, mock_db):
        ct_id = uuid.UUID(TENANT_ID)
        rows = [_make_audit_row(customer_tenant_id=ct_id)]
        count_result = MagicMock()
        count_result.scalar.return_value = 1

        data_result = MagicMock()
        data_result.all.return_value = rows

        mock_db.execute = AsyncMock(side_effect=[count_result, data_result])

        resp = client.get("/security/audit", params={"customer_tenant_id": TENANT_ID})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["customer_tenant_id"] == TENANT_ID

    def test_audit_pagination(self, client, mock_db):
        count_result = MagicMock()
        count_result.scalar.return_value = 100

        data_result = MagicMock()
        data_result.all.return_value = [_make_audit_row() for _ in range(10)]

        mock_db.execute = AsyncMock(side_effect=[count_result, data_result])

        resp = client.get("/security/audit", params={"page": 2, "page_size": 10})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 100
        assert body["page"] == 2
        assert body["page_size"] == 10
        assert len(body["items"]) == 10


# ===================================================================
# reports.py
# ===================================================================


class TestReports:
    def test_job_summary(self, client, mock_reporting):
        resp = client.get(f"/tenants/{TENANT_ID}/reports/summary")
        assert resp.status_code == 200
        assert resp.json() == [{"day": "2026-03-20", "total": 10}]
        mock_reporting.job_summary.assert_awaited_once()

    def test_entity_detections(self, client, mock_reporting):
        resp = client.get(f"/tenants/{TENANT_ID}/reports/detections")
        assert resp.status_code == 200
        assert resp.json() == [{"entity": "SSN", "count": 5}]
        mock_reporting.entity_detections.assert_awaited_once()

    def test_label_distribution(self, client, mock_reporting):
        resp = client.get(f"/tenants/{TENANT_ID}/reports/labels")
        assert resp.status_code == 200
        assert resp.json() == [{"label": "Confidential", "count": 20}]
        mock_reporting.label_distribution.assert_awaited_once()

    def test_throughput_stats(self, client, mock_reporting):
        resp = client.get(f"/tenants/{TENANT_ID}/reports/throughput")
        assert resp.status_code == 200
        assert resp.json() == [{"files_per_second": 3.5}]
        mock_reporting.throughput_stats.assert_awaited_once()

    def test_tenant_overview(self, client, mock_reporting):
        resp = client.get(f"/tenants/{TENANT_ID}/reports/overview")
        assert resp.status_code == 200
        assert resp.json() == {"total_jobs": 42, "files_labelled": 1234}
        mock_reporting.tenant_overview.assert_awaited_once()


# ===================================================================
# sites.py
# ===================================================================


class TestSites:
    def _setup_tenant_found(self, mock_db):
        """Configure mock_db so the CustomerTenant lookup succeeds."""
        tenant = SimpleNamespace(entra_tenant_id="entra-tid-123")
        scalar_result = MagicMock()
        scalar_result.scalar_one_or_none.return_value = tenant
        mock_db.execute = AsyncMock(return_value=scalar_result)

    def test_list_sites(self, client, mock_db, mock_graph):
        self._setup_tenant_found(mock_db)
        mock_graph.get_all_pages = AsyncMock(
            return_value=[
                {"id": "site-1", "displayName": "Docs", "webUrl": "https://contoso.sharepoint.com/sites/docs"},
                {"id": "site-2", "displayName": "HR", "webUrl": "https://contoso.sharepoint.com/sites/hr"},
            ]
        )

        resp = client.get(f"/tenants/{TENANT_ID}/sites")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["id"] == "site-1"
        assert data[1]["displayName"] == "HR"

    def test_list_sites_with_search(self, client, mock_db, mock_graph):
        self._setup_tenant_found(mock_db)
        mock_graph.get_all_pages = AsyncMock(
            return_value=[
                {"id": "site-1", "displayName": "Project X", "webUrl": "https://contoso.sharepoint.com/sites/projx"},
            ]
        )

        resp = client.get(f"/tenants/{TENANT_ID}/sites", params={"search": "Project"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        # Verify the search term was URL-encoded in the Graph call
        call_args = mock_graph.get_all_pages.call_args
        assert "search=Project" in call_args[0][1]

    def test_search_term_too_long(self, client, mock_db, mock_graph):
        self._setup_tenant_found(mock_db)
        long_term = "a" * 257
        resp = client.get(f"/tenants/{TENANT_ID}/sites", params={"search": long_term})
        assert resp.status_code == 400
        assert "too long" in resp.json()["detail"].lower()

    def test_search_path_traversal_rejected(self, client, mock_db, mock_graph):
        self._setup_tenant_found(mock_db)
        resp = client.get(f"/tenants/{TENANT_ID}/sites", params={"search": "../etc/passwd"})
        assert resp.status_code == 400
        assert "invalid characters" in resp.json()["detail"].lower()

    def test_graph_error_returns_empty(self, client, mock_db, mock_graph):
        self._setup_tenant_found(mock_db)
        from app.core.exceptions import StableLabelError
        mock_graph.get_all_pages = AsyncMock(side_effect=StableLabelError("boom"))

        resp = client.get(f"/tenants/{TENANT_ID}/sites")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_sites_filters_no_id_entries(self, client, mock_db, mock_graph):
        self._setup_tenant_found(mock_db)
        mock_graph.get_all_pages = AsyncMock(
            return_value=[
                {"id": "site-1", "displayName": "Good", "webUrl": "https://contoso.sharepoint.com/sites/good"},
                {"id": "", "displayName": "Bad", "webUrl": ""},
                {"displayName": "No ID", "webUrl": ""},
            ]
        )

        resp = client.get(f"/tenants/{TENANT_ID}/sites")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "site-1"
