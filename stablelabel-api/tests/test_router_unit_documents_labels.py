"""Unit tests for documents and labels routers using FastAPI TestClient with dependency overrides."""

from __future__ import annotations

import io
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.entra_auth import CurrentUser, get_current_user
from app.core.exceptions import (
    EncryptionLabelGuardError,
    LabelDowngradeError,
    LabelNotFoundError,
    StableLabelError,
)
from app.db.base import get_session
from app.dependencies import (
    get_document_service,
    get_graph_client,
    get_label_management_service,
    get_label_service,
)
from app.models.document import (
    BulkLabelResponse,
    CsvUploadResult,
    DocumentLabel,
    LabelJobResult,
)
from app.models.label import SensitivityLabel
from app.routers import documents, labels

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TID = "00000000-0000-0000-0000-000000000010"


def _make_user(role: str = "Operator") -> CurrentUser:
    return CurrentUser(
        id="00000000-0000-0000-0000-000000000001",
        entra_oid="oid-1",
        msp_tenant_id="00000000-0000-0000-0000-000000000002",
        entra_tenant_id="00000000-0000-0000-0000-000000000003",
        email="test@example.com",
        display_name="Test User",
        role=role,
    )


def _make_label(**overrides) -> SensitivityLabel:
    defaults = dict(
        id="label-1",
        name="Confidential",
        display_name="Confidential",
        priority=5,
        is_active=True,
        has_protection=False,
        applicable_to=["file"],
        is_parent=False,
    )
    defaults.update(overrides)
    return SensitivityLabel(**defaults)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mock_tenant_access():
    with patch("app.routers.documents.check_tenant_access", new_callable=AsyncMock):
        with patch("app.routers.labels.check_tenant_access", new_callable=AsyncMock):
            yield


@pytest.fixture()
def doc_svc():
    return AsyncMock()


@pytest.fixture()
def graph():
    return AsyncMock()


@pytest.fixture()
def label_svc():
    return AsyncMock()


@pytest.fixture()
def label_mgmt():
    return AsyncMock()


@pytest.fixture()
def db_session():
    """Async mock session that supports db.get() and db.add() / db.commit()."""
    session = AsyncMock()
    # db.add is sync in SQLAlchemy — use a plain MagicMock to avoid
    # "coroutine never awaited" warnings.
    session.add = MagicMock()
    # db.get(CustomerTenant, ...) returns a mock tenant for audit events
    mock_tenant = MagicMock()
    mock_tenant.msp_tenant_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    mock_tenant.id = uuid.UUID(TID)
    session.get.return_value = mock_tenant
    return session


@pytest.fixture()
def doc_client(doc_svc, graph, db_session):
    app = FastAPI()
    app.include_router(documents.router)
    app.dependency_overrides[get_current_user] = lambda: _make_user("Operator")
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_document_service] = lambda: doc_svc
    app.dependency_overrides[get_graph_client] = lambda: graph
    return TestClient(app)


@pytest.fixture()
def label_client(label_svc, label_mgmt, db_session):
    app = FastAPI()
    app.include_router(labels.router)
    app.dependency_overrides[get_current_user] = lambda: _make_user("Admin")
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_label_service] = lambda: label_svc
    app.dependency_overrides[get_label_management_service] = lambda: label_mgmt
    return TestClient(app)


# ===================================================================
# documents.py tests
# ===================================================================


class TestExtractLabel:
    def test_returns_label(self, doc_client, doc_svc):
        doc_svc.extract_label.return_value = DocumentLabel(
            sensitivity_label_id="lbl-1", assignment_method="standard", tenant_id=TID
        )
        resp = doc_client.post(
            f"/tenants/{TID}/documents/extract-label?drive_id=d1&item_id=i1"
        )
        assert resp.status_code == 200
        assert resp.json()["sensitivity_label_id"] == "lbl-1"

    def test_returns_none(self, doc_client, doc_svc):
        doc_svc.extract_label.return_value = None
        resp = doc_client.post(
            f"/tenants/{TID}/documents/extract-label?drive_id=d1&item_id=i1"
        )
        assert resp.status_code == 200
        assert resp.json() is None


class TestApplyLabel:
    _body = {
        "drive_id": "d1",
        "item_id": "i1",
        "sensitivity_label_id": "lbl-1",
        "assignment_method": "standard",
        "justification_text": "",
    }

    def test_success(self, doc_client, doc_svc):
        doc_svc.apply_label.return_value = LabelJobResult(
            drive_id="d1", item_id="i1", filename="f.docx", status="completed"
        )
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label", json=self._body
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

    def test_encryption_guard_422(self, doc_client, doc_svc):
        doc_svc.apply_label.side_effect = EncryptionLabelGuardError("encrypted")
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label", json=self._body
        )
        assert resp.status_code == 422
        assert "encrypted" in resp.json()["detail"].lower()

    def test_downgrade_409(self, doc_client, doc_svc):
        doc_svc.apply_label.side_effect = LabelDowngradeError("downgrade")
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label", json=self._body
        )
        assert resp.status_code == 409
        assert "downgrade" in resp.json()["detail"].lower()

    def test_label_not_found_404(self, doc_client, doc_svc):
        doc_svc.apply_label.side_effect = LabelNotFoundError("missing")
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label", json=self._body
        )
        assert resp.status_code == 404
        assert "missing" in resp.json()["detail"].lower()

    def test_stable_label_error_502(self, doc_client, doc_svc):
        doc_svc.apply_label.side_effect = StableLabelError("boom")
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label", json=self._body
        )
        assert resp.status_code == 502
        assert "boom" in resp.json()["detail"].lower()


class TestRemoveLabel:
    _body = {"drive_id": "d1", "item_id": "i1"}

    def test_success_204(self, doc_client, graph):
        graph.post.return_value = None
        resp = doc_client.post(
            f"/tenants/{TID}/documents/remove-label", json=self._body
        )
        assert resp.status_code == 204
        graph.post.assert_called_once()

    def test_stable_label_error_502(self, doc_client, graph):
        graph.post.side_effect = StableLabelError("graph fail")
        resp = doc_client.post(
            f"/tenants/{TID}/documents/remove-label", json=self._body
        )
        assert resp.status_code == 502
        assert "graph fail" in resp.json()["detail"].lower()


class TestApplyLabelBulk:
    def _body(self, tenant_id=TID):
        return {
            "tenant_id": tenant_id,
            "sensitivity_label_id": "lbl-1",
            "items": [{"drive_id": "d1", "item_id": "i1", "filename": "f.docx"}],
        }

    def test_tenant_mismatch_400(self, doc_client, doc_svc):
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label-bulk",
            json=self._body(tenant_id="wrong-tenant"),
        )
        assert resp.status_code == 400

    def test_success(self, doc_client, doc_svc):
        doc_svc.apply_label_bulk.return_value = BulkLabelResponse(
            job_id="j1", tenant_id=TID, label_id="lbl-1", total=1, completed=1
        )
        resp = doc_client.post(
            f"/tenants/{TID}/documents/apply-label-bulk", json=self._body()
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1


class TestUploadCsv:
    def _upload(self, client, filename, content, content_type="text/csv"):
        return client.post(
            f"/tenants/{TID}/documents/upload-csv",
            files={"file": (filename, io.BytesIO(content.encode()), content_type)},
        )

    def test_wrong_extension_400(self, doc_client, doc_svc):
        resp = self._upload(doc_client, "data.txt", "some data")
        assert resp.status_code == 400
        assert "csv" in resp.json()["detail"].lower()

    def test_missing_columns_400(self, doc_client, doc_svc):
        resp = self._upload(doc_client, "test.csv", "col_a,col_b\n1,2\n")
        assert resp.status_code == 400
        assert "columns" in resp.json()["detail"].lower()

    def test_valid_csv(self, doc_client, doc_svc):
        doc_svc.apply_label_bulk.return_value = BulkLabelResponse(
            job_id="j1",
            tenant_id=TID,
            label_id="l1",
            total=1,
            completed=1,
            results=[],
        )
        csv_content = "drive_id,item_id,filename,label_id\nd1,i1,test.docx,l1\n"
        resp = self._upload(doc_client, "test.csv", csv_content)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_rows"] == 1
        assert body["valid_rows"] == 1
        assert body["invalid_rows"] == 0


# ===================================================================
# labels.py tests
# ===================================================================


class TestListLabels:
    def test_returns_labels(self, label_client, label_svc):
        label_svc.get_labels.return_value = [_make_label()]
        resp = label_client.get(f"/tenants/{TID}/labels")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["name"] == "Confidential"

    def test_appliable_only(self, label_client, label_svc):
        label_svc.get_appliable_labels.return_value = [_make_label(name="Public")]
        resp = label_client.get(f"/tenants/{TID}/labels?appliable_only=true")
        assert resp.status_code == 200
        assert resp.json()[0]["name"] == "Public"
        label_svc.get_appliable_labels.assert_awaited_once_with(TID)


class TestGetLabel:
    def test_returns_single_label(self, label_client, label_svc):
        label_svc.get_label.return_value = _make_label()
        resp = label_client.get(f"/tenants/{TID}/labels/label-1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "label-1"


class TestCreateLabel:
    def test_success_201(self, label_client, label_mgmt, db_session):
        label_mgmt.create_label.return_value = {"id": "new-lbl", "name": "Secret"}
        resp = label_client.post(
            f"/tenants/{TID}/labels", json={"name": "Secret"}
        )
        assert resp.status_code == 201
        assert resp.json()["id"] == "new-lbl"
        label_mgmt.create_label.assert_awaited_once()
        # Audit event recorded
        db_session.add.assert_called()
        db_session.commit.assert_awaited()


class TestCreateSublabel:
    def test_success_201(self, label_client, label_svc, label_mgmt, db_session):
        label_svc.get_label.return_value = _make_label(id="parent-1", is_parent=True)
        label_mgmt.create_label.return_value = {"id": "sub-1", "name": "PCI"}
        resp = label_client.post(
            f"/tenants/{TID}/labels/parent-1/sublabels", json={"name": "PCI"}
        )
        assert resp.status_code == 201
        assert resp.json()["id"] == "sub-1"

    def test_parent_not_found_404(self, label_client, label_svc, label_mgmt):
        label_svc.get_label.return_value = None
        resp = label_client.post(
            f"/tenants/{TID}/labels/missing/sublabels", json={"name": "PCI"}
        )
        assert resp.status_code == 404


class TestUpdateLabel:
    def test_success(self, label_client, label_mgmt, db_session):
        label_mgmt.update_label.return_value = {"id": "label-1", "name": "Renamed"}
        resp = label_client.patch(
            f"/tenants/{TID}/labels/label-1", json={"name": "Renamed"}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    def test_empty_body_400(self, label_client, label_mgmt):
        resp = label_client.patch(f"/tenants/{TID}/labels/label-1", json={})
        assert resp.status_code == 400
        assert "no fields" in resp.json()["detail"].lower()


class TestDeleteLabel:
    def test_success_204(self, label_client, label_mgmt, db_session):
        label_mgmt.delete_label.return_value = None
        resp = label_client.delete(f"/tenants/{TID}/labels/label-1")
        assert resp.status_code == 204
        label_mgmt.delete_label.assert_awaited_once_with(TID, "label-1")
        db_session.add.assert_called()
        db_session.commit.assert_awaited()
