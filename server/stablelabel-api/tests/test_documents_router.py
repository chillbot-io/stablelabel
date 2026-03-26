"""Integration tests for the documents router (/tenants/{id}/documents).

DocumentService and GraphClient are mocked — auth, tenant access,
error mapping, and CSV validation are tested against the real app.
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    EncryptionLabelGuardError,
    LabelDowngradeError,
    LabelNotFoundError,
    StableLabelError,
)
from app.dependencies import get_document_service, get_graph_client
from app.models.document import (
    BulkLabelResponse,
    BulkRemoveResponse,
    DocumentLabel,
    LabelJobResult,
)
from tests.conftest import (
    CUSTOMER_TENANT_ID,
    OPERATOR_USER,
    VIEWER_USER,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)


def _mock_doc_service():
    mock = AsyncMock()
    mock.extract_label = AsyncMock(
        return_value=DocumentLabel(sensitivity_label_id="lbl-1")
    )
    mock.apply_label = AsyncMock(
        return_value=LabelJobResult(
            drive_id="d1", item_id="i1", filename="test.docx", status="completed",
        )
    )
    mock.apply_label_bulk = AsyncMock(
        return_value=BulkLabelResponse(
            job_id="job-1", tenant_id=CT, label_id="lbl-1",
            total=1, completed=1, results=[],
        )
    )
    mock.remove_label_bulk = AsyncMock(
        return_value=BulkRemoveResponse(
            job_id="job-1", tenant_id=CT, mode="label_only",
            total=1, completed=1, results=[],
        )
    )
    return mock


def _mock_graph():
    mock = AsyncMock()
    mock.post = AsyncMock(return_value={})
    return mock


def _overrides(doc_svc=None, graph=None):
    o = {}
    if doc_svc:
        o[get_document_service] = lambda: doc_svc
    if graph:
        o[get_graph_client] = lambda: graph
    return o


# ── Extract label ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_label(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/extract-label?drive_id=d1&item_id=i1"
        )
    assert resp.status_code == 200
    assert resp.json()["sensitivity_label_id"] == "lbl-1"


# ── Apply label ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_apply_label(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label",
            json={
                "drive_id": "d1",
                "item_id": "i1",
                "sensitivity_label_id": "lbl-1",
            },
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_apply_label_viewer_forbidden(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(VIEWER_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label",
            json={
                "drive_id": "d1",
                "item_id": "i1",
                "sensitivity_label_id": "lbl-1",
            },
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_apply_label_encryption_guard_422(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label = AsyncMock(
        side_effect=EncryptionLabelGuardError("Label has encryption")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label",
            json={
                "drive_id": "d1",
                "item_id": "i1",
                "sensitivity_label_id": "lbl-enc",
            },
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_apply_label_downgrade_409(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label = AsyncMock(
        side_effect=LabelDowngradeError("Cannot downgrade")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label",
            json={
                "drive_id": "d1",
                "item_id": "i1",
                "sensitivity_label_id": "lbl-1",
            },
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_apply_label_not_found_404(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label = AsyncMock(
        side_effect=LabelNotFoundError("Label not found")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label",
            json={
                "drive_id": "d1",
                "item_id": "i1",
                "sensitivity_label_id": "lbl-missing",
            },
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_apply_label_graph_error_502(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label = AsyncMock(
        side_effect=StableLabelError("Graph API error")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label",
            json={
                "drive_id": "d1",
                "item_id": "i1",
                "sensitivity_label_id": "lbl-1",
            },
        )
    assert resp.status_code == 502


# ── Remove label ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_label(db_session: AsyncSession):
    graph = _mock_graph()
    app = _build_app(OPERATOR_USER, db_session, _overrides(graph=graph))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/remove-label",
            json={"drive_id": "d1", "item_id": "i1"},
        )
    assert resp.status_code == 204
    graph.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_remove_label_graph_error_502(db_session: AsyncSession):
    graph = _mock_graph()
    graph.post = AsyncMock(side_effect=StableLabelError("fail"))
    app = _build_app(OPERATOR_USER, db_session, _overrides(graph=graph))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/remove-label",
            json={"drive_id": "d1", "item_id": "i1"},
        )
    assert resp.status_code == 502


# ── Bulk apply ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_apply(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label-bulk",
            json={
                "tenant_id": CT,
                "sensitivity_label_id": "lbl-1",
                "items": [{"drive_id": "d1", "item_id": "i1", "filename": "a.docx"}],
            },
        )
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_bulk_apply_tenant_id_mismatch(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label-bulk",
            json={
                "tenant_id": "00000000-0000-0000-0000-999999999999",
                "sensitivity_label_id": "lbl-1",
                "items": [],
            },
        )
    assert resp.status_code == 400
    assert "must match" in resp.json()["detail"]


# ── CSV upload ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_csv(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    csv_content = "drive_id,item_id,filename,label_id\nd1,i1,test.docx,lbl-1\n"
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("labels.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 1
    assert data["valid_rows"] == 1


@pytest.mark.asyncio
async def test_upload_csv_wrong_extension(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("labels.xlsx", io.BytesIO(b"data"), "application/octet-stream")},
        )
    assert resp.status_code == 400
    assert ".csv" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_csv_missing_columns(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    csv_content = "drive_id,item_id\nd1,i1\n"
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("bad.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
    assert resp.status_code == 400
    assert "columns" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_csv_invalid_rows(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    csv_content = "drive_id,item_id,filename,label_id\n,,,\nd1,i1,test.docx,lbl-1\n"
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("mixed.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 2
    assert data["invalid_rows"] == 1
    assert len(data["errors"]) >= 1


# ── Bulk apply error mapping ────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_apply_encryption_guard_422(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label_bulk = AsyncMock(
        side_effect=EncryptionLabelGuardError("Label has encryption")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label-bulk",
            json={
                "tenant_id": CT,
                "sensitivity_label_id": "lbl-enc",
                "items": [{"drive_id": "d1", "item_id": "i1", "filename": "a.docx"}],
            },
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_apply_downgrade_409(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label_bulk = AsyncMock(
        side_effect=LabelDowngradeError("Cannot downgrade")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label-bulk",
            json={
                "tenant_id": CT,
                "sensitivity_label_id": "lbl-1",
                "items": [{"drive_id": "d1", "item_id": "i1", "filename": "a.docx"}],
            },
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_bulk_apply_not_found_404(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label_bulk = AsyncMock(
        side_effect=LabelNotFoundError("Label not found")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label-bulk",
            json={
                "tenant_id": CT,
                "sensitivity_label_id": "lbl-missing",
                "items": [{"drive_id": "d1", "item_id": "i1", "filename": "a.docx"}],
            },
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_bulk_apply_graph_error_502(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label_bulk = AsyncMock(
        side_effect=StableLabelError("Graph API error")
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/apply-label-bulk",
            json={
                "tenant_id": CT,
                "sensitivity_label_id": "lbl-1",
                "items": [{"drive_id": "d1", "item_id": "i1", "filename": "a.docx"}],
            },
        )
    assert resp.status_code == 502


# ── Remove-label-bulk tenant mismatch ───────────────────────


@pytest.mark.asyncio
async def test_remove_label_bulk_tenant_mismatch(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/remove-label-bulk",
            json={
                "tenant_id": "00000000-0000-0000-0000-999999999999",
                "items": [],
                "mode": "label_only",
            },
        )
    assert resp.status_code == 400
    assert "must match" in resp.json()["detail"]


# ── CSV edge cases ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_csv_too_large(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    # Create content just over 10MB
    content = b"drive_id,item_id,filename,label_id\n" + b"x" * (10 * 1024 * 1024 + 1)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("big.csv", io.BytesIO(content), "text/csv")},
        )
    assert resp.status_code == 400
    assert "too large" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_csv_non_utf8(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    # Invalid UTF-8 bytes
    content = b"\xff\xfedrive_id,item_id,filename,label_id\n"
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("bad.csv", io.BytesIO(content), "text/csv")},
        )
    assert resp.status_code == 400
    assert "UTF-8" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_csv_error_truncation(db_session: AsyncSession):
    svc = _mock_doc_service()
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    # Generate CSV with 60 invalid rows (all fields empty)
    header = "drive_id,item_id,filename,label_id\n"
    bad_rows = ",,,\n" * 60
    csv_content = header + bad_rows
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("many_errors.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 60
    assert data["invalid_rows"] == 60
    # 50 individual errors + 1 truncation message
    assert len(data["errors"]) == 51
    assert "... and 10 more" in data["errors"][-1]


@pytest.mark.asyncio
async def test_upload_csv_tracks_bulk_apply_failures(db_session: AsyncSession):
    svc = _mock_doc_service()
    svc.apply_label_bulk = AsyncMock(
        return_value=BulkLabelResponse(
            job_id="j1",
            tenant_id=CT,
            label_id="lbl-1",
            total=1,
            completed=0,
            results=[
                LabelJobResult(
                    drive_id="d1",
                    item_id="i1",
                    filename="bad.docx",
                    status="failed",
                    error="Graph 500",
                )
            ],
        )
    )
    app = _build_app(OPERATOR_USER, db_session, _overrides(doc_svc=svc))
    transport = httpx.ASGITransport(app=app)

    csv_content = "drive_id,item_id,filename,label_id\nd1,i1,bad.docx,lbl-1\n"
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{CT}/documents/upload-csv",
            files={"file": ("labels.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 1
    assert data["valid_rows"] == 1
    assert any("bad.docx: Graph 500" in e for e in data["errors"])
