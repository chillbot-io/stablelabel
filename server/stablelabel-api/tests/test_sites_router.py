"""Integration tests for the sites router (/tenants/{id}/sites).

The Graph API calls are mocked — everything else (auth, tenant access,
input validation) is tested against the real app.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_graph_client
from tests.conftest import (
    CUSTOMER_TENANT_ID,
    OPERATOR_USER,
    VIEWER_USER,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)


def _mock_graph_client(sites: list[dict] | None = None):
    """Create a mock GraphClient that returns canned site data."""
    mock = AsyncMock()
    mock.get_all_pages = AsyncMock(return_value=sites or [])
    return mock


@pytest.fixture()
async def sites_client(db_session: AsyncSession):
    """Viewer client with mocked Graph API returning sample sites."""
    sample_sites = [
        {"id": "site-1", "displayName": "Marketing", "webUrl": "https://contoso.sharepoint.com/sites/marketing"},
        {"id": "site-2", "displayName": "Engineering", "webUrl": "https://contoso.sharepoint.com/sites/eng"},
    ]
    mock = _mock_graph_client(sample_sites)
    app = _build_app(VIEWER_USER, db_session, {get_graph_client: lambda: mock})
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_list_sites(sites_client: httpx.AsyncClient):
    resp = await sites_client.get(f"/tenants/{CT}/sites")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["displayName"] == "Marketing"
    assert data[1]["id"] == "site-2"


@pytest.mark.asyncio
async def test_list_sites_with_search(sites_client: httpx.AsyncClient):
    resp = await sites_client.get(f"/tenants/{CT}/sites?search=marketing")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_search_term_too_long(sites_client: httpx.AsyncClient):
    long_search = "a" * 257
    resp = await sites_client.get(f"/tenants/{CT}/sites?search={long_search}")
    assert resp.status_code == 400
    assert "max 256" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_search_term_path_traversal_rejected(sites_client: httpx.AsyncClient):
    resp = await sites_client.get(f"/tenants/{CT}/sites?search=../../etc/passwd")
    assert resp.status_code == 400
    assert "invalid characters" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_search_term_slash_rejected(sites_client: httpx.AsyncClient):
    resp = await sites_client.get(f"/tenants/{CT}/sites?search=foo/bar")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_graph_error_returns_empty_list(db_session: AsyncSession):
    """Graph API failure should return empty list, not 500."""
    from app.core.exceptions import StableLabelError

    mock = AsyncMock()
    mock.get_all_pages = AsyncMock(side_effect=StableLabelError("API error"))
    app = _build_app(VIEWER_USER, db_session, {get_graph_client: lambda: mock})
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/sites")
        assert resp.status_code == 200
        assert resp.json() == []


@pytest.mark.asyncio
async def test_sites_filters_entries_without_id(db_session: AsyncSession):
    """Sites without an id field should be filtered out."""
    sites_data = [
        {"id": "good-site", "displayName": "Good", "webUrl": "https://example.com"},
        {"displayName": "No ID", "webUrl": "https://example.com"},  # missing id
    ]
    mock = _mock_graph_client(sites_data)
    app = _build_app(VIEWER_USER, db_session, {get_graph_client: lambda: mock})
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(f"/tenants/{CT}/sites")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["id"] == "good-site"
