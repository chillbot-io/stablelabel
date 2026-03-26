"""Integration tests for StableLabel API route handlers.

Uses a real TimescaleDB instance via testcontainers — no SQLite shims.
All fixtures (db_session, admin_client, etc.) are defined in conftest.py.
"""

from __future__ import annotations

import uuid

import httpx
import pytest

from tests.conftest import CUSTOMER_TENANT_ID

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
    payload = {"name": "Test labelling job", "config": {"target_label_id": "test-label"}}
    resp = await operator_client.post(f"/tenants/{CT}/jobs", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test labelling job"
    assert data["status"] == "pending"
    assert data["config"]["target_label_id"] == "test-label"
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
