"""Tests for dependencies.py, db/base.py, and main.py infrastructure."""

from __future__ import annotations

import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

_LRU_CACHED_FUNCS: list[str] = [
    "get_settings",
    "get_token_manager",
    "get_graph_client",
    "get_label_service",
    "get_document_service",
    "get_powershell_runner",
    "get_label_management_service",
    "get_reporting_service",
]


def _clear_dependency_caches():
    """Clear every lru_cache in app.dependencies to avoid test pollution."""
    from app import dependencies

    for name in _LRU_CACHED_FUNCS:
        fn = getattr(dependencies, name, None)
        if fn is not None and hasattr(fn, "cache_clear"):
            fn.cache_clear()


def _reset_db_base():
    """Reset the module-level globals in db.base so each test starts clean."""
    from app.db import base

    base._engine = None
    base._session_factory = None


def _reset_arq_pool():
    """Reset the module-level _arq_pool in dependencies."""
    import app.dependencies as deps

    deps._arq_pool = None


@pytest.fixture(autouse=True)
def _clean_state():
    """Autouse fixture: clear caches and module globals before and after every test."""
    _clear_dependency_caches()
    _reset_db_base()
    _reset_arq_pool()
    yield
    _clear_dependency_caches()
    _reset_db_base()
    _reset_arq_pool()


# ═══════════════════════════════════════════════════════════════════
# dependencies.py — set_arq_pool / get_arq_pool
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_arq_pool_raises_when_not_set():
    from app.dependencies import get_arq_pool

    with pytest.raises(RuntimeError, match="arq pool not initialized"):
        await get_arq_pool()


@pytest.mark.asyncio
async def test_set_arq_pool_then_get():
    from app.dependencies import get_arq_pool, set_arq_pool

    sentinel = MagicMock(name="fake_arq_pool")
    set_arq_pool(sentinel)
    result = await get_arq_pool()
    assert result is sentinel


# ═══════════════════════════════════════════════════════════════════
# dependencies.py — get_db
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_db_yields_session():
    """get_db should proxy through db.base.get_session and yield a session."""
    fake_session = MagicMock(name="fake_session")

    async def _fake_get_session():
        yield fake_session

    with patch("app.dependencies.get_session", _fake_get_session):
        from app.dependencies import get_db

        sessions = []
        async for s in get_db():
            sessions.append(s)

    assert sessions == [fake_session]


# ═══════════════════════════════════════════════════════════════════
# dependencies.py — lru_cache singletons
# ═══════════════════════════════════════════════════════════════════


@patch("app.dependencies.Settings")
def test_get_settings_returns_settings_and_caches(mock_settings_cls):
    from app.dependencies import get_settings

    instance = MagicMock(name="settings_instance")
    mock_settings_cls.return_value = instance

    result1 = get_settings()
    result2 = get_settings()
    assert result1 is instance
    assert result2 is result1
    # Settings() called only once thanks to lru_cache
    mock_settings_cls.assert_called_once()


@patch("app.dependencies.get_settings")
@patch("app.dependencies.TokenManager")
def test_get_token_manager(mock_tm_cls, mock_settings):
    _clear_dependency_caches()
    from app.dependencies import get_token_manager

    s = MagicMock(azure_client_id="cid", azure_client_secret="csec")
    mock_settings.return_value = s
    tm_instance = MagicMock()
    mock_tm_cls.return_value = tm_instance

    result = get_token_manager()
    assert result is tm_instance
    mock_tm_cls.assert_called_once_with(client_id="cid", client_secret="csec")


@patch("app.dependencies.get_settings")
@patch("app.dependencies.get_token_manager")
@patch("app.dependencies.GraphClient")
def test_get_graph_client(mock_gc_cls, mock_tm, mock_settings):
    _clear_dependency_caches()
    from app.dependencies import get_graph_client

    s = MagicMock(graph_rate_limit=5.0, graph_rate_burst=10.0)
    mock_settings.return_value = s
    tm = MagicMock()
    mock_tm.return_value = tm
    gc_instance = MagicMock()
    mock_gc_cls.return_value = gc_instance

    result = get_graph_client()
    assert result is gc_instance
    mock_gc_cls.assert_called_once_with(token_manager=tm, rate_limit=5.0, rate_burst=10.0)


@patch("app.dependencies.get_settings")
@patch("app.dependencies.get_graph_client")
@patch("app.dependencies.LabelService")
def test_get_label_service(mock_ls_cls, mock_gc, mock_settings):
    _clear_dependency_caches()
    from app.dependencies import get_label_service

    s = MagicMock()
    mock_settings.return_value = s
    gc = MagicMock()
    mock_gc.return_value = gc
    ls_instance = MagicMock()
    mock_ls_cls.return_value = ls_instance

    result = get_label_service()
    assert result is ls_instance
    mock_ls_cls.assert_called_once_with(graph=gc, settings=s)


@patch("app.dependencies.get_settings")
@patch("app.dependencies.get_graph_client")
@patch("app.dependencies.get_label_service")
@patch("app.dependencies.DocumentService")
def test_get_document_service(mock_ds_cls, mock_ls, mock_gc, mock_settings):
    _clear_dependency_caches()
    from app.dependencies import get_document_service

    s = MagicMock()
    mock_settings.return_value = s
    gc = MagicMock()
    mock_gc.return_value = gc
    ls = MagicMock()
    mock_ls.return_value = ls
    ds_instance = MagicMock()
    mock_ds_cls.return_value = ds_instance

    result = get_document_service()
    assert result is ds_instance
    mock_ds_cls.assert_called_once_with(graph=gc, labels=ls, settings=s)


@patch("app.dependencies.get_settings")
@patch("app.dependencies.PowerShellRunner")
def test_get_powershell_runner(mock_ps_cls, mock_settings):
    _clear_dependency_caches()
    from app.dependencies import get_powershell_runner

    s = MagicMock(azure_client_id="cid", azure_client_secret="csec")
    mock_settings.return_value = s
    ps_instance = MagicMock()
    mock_ps_cls.return_value = ps_instance

    result = get_powershell_runner()
    assert result is ps_instance
    mock_ps_cls.assert_called_once_with(client_id="cid", client_secret="csec")


@patch("app.dependencies.get_graph_client")
@patch("app.dependencies.get_powershell_runner")
@patch("app.dependencies.LabelManagementService")
def test_get_label_management_service(mock_lms_cls, mock_ps, mock_gc):
    _clear_dependency_caches()
    from app.dependencies import get_label_management_service

    gc = MagicMock()
    mock_gc.return_value = gc
    ps = MagicMock()
    mock_ps.return_value = ps
    lms_instance = MagicMock()
    mock_lms_cls.return_value = lms_instance

    result = get_label_management_service()
    assert result is lms_instance
    mock_lms_cls.assert_called_once_with(graph=gc, powershell=ps)


@patch("app.dependencies.get_settings")
@patch("app.dependencies.ReportingService")
def test_get_reporting_service(mock_rs_cls, mock_settings):
    _clear_dependency_caches()
    from app.dependencies import get_reporting_service

    s = MagicMock(database_url="postgresql://x")
    mock_settings.return_value = s
    rs_instance = MagicMock()
    mock_rs_cls.return_value = rs_instance

    result = get_reporting_service()
    assert result is rs_instance
    mock_rs_cls.assert_called_once_with(database_url="postgresql://x")


# ═══════════════════════════════════════════════════════════════════
# db/base.py — init_engine
# ═══════════════════════════════════════════════════════════════════


@patch("app.db.base.async_sessionmaker")
@patch("app.db.base.create_async_engine")
def test_init_engine_creates_engine_and_factory(mock_create, mock_sessionmaker):
    from app.db import base
    from app.db.base import init_engine

    fake_engine = MagicMock(name="engine")
    mock_create.return_value = fake_engine
    fake_factory = MagicMock(name="factory")
    mock_sessionmaker.return_value = fake_factory

    settings = MagicMock(
        database_url="postgresql+asyncpg://test",
        db_pool_size=5,
        db_max_overflow=10,
    )
    init_engine(settings)

    mock_create.assert_called_once_with(
        "postgresql+asyncpg://test",
        pool_size=5,
        max_overflow=10,
        echo=False,
    )
    mock_sessionmaker.assert_called_once_with(fake_engine, expire_on_commit=False)
    assert base._engine is fake_engine
    assert base._session_factory is fake_factory


# ═══════════════════════════════════════════════════════════════════
# db/base.py — dispose_engine
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_dispose_engine_with_engine():
    from app.db import base
    from app.db.base import dispose_engine

    mock_engine = AsyncMock(name="engine")
    base._engine = mock_engine

    await dispose_engine()
    mock_engine.dispose.assert_awaited_once()


@pytest.mark.asyncio
async def test_dispose_engine_without_engine():
    from app.db.base import dispose_engine

    # Should not raise when _engine is None
    await dispose_engine()


# ═══════════════════════════════════════════════════════════════════
# db/base.py — get_session
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_session_raises_when_not_initialized():
    from app.db.base import get_session

    with pytest.raises(RuntimeError, match="Database not initialised"):
        async for _ in get_session():
            pass


@pytest.mark.asyncio
async def test_get_session_yields_session():
    from app.db import base
    from app.db.base import get_session

    fake_session = AsyncMock(name="session")

    # async_sessionmaker returns a context-manager that yields a session
    factory = MagicMock()
    ctx = AsyncMock()
    ctx.__aenter__.return_value = fake_session
    ctx.__aexit__.return_value = False
    factory.return_value = ctx

    base._session_factory = factory

    sessions = []
    async for s in get_session():
        sessions.append(s)

    assert len(sessions) == 1
    assert sessions[0] is fake_session


# ═══════════════════════════════════════════════════════════════════
# main.py — app instance
# ═══════════════════════════════════════════════════════════════════


def test_app_is_fastapi_instance():
    from app.main import app

    assert isinstance(app, FastAPI)


def test_app_has_title():
    from app.main import app

    assert app.title == "StableLabel API"


def test_app_has_registered_routers():
    """All expected router prefixes should be present in app.routes."""
    from app.main import app

    route_paths = {r.path for r in app.routes if hasattr(r, "path")}
    # health router should be present (commonly at /health or /healthz)
    # We just verify there are many routes registered (routers are included)
    assert len(route_paths) > 5, f"Expected many routes, got: {route_paths}"


def test_app_has_cors_middleware():
    """CORSMiddleware should be in the middleware stack."""
    from app.main import app

    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" in middleware_classes


# ═══════════════════════════════════════════════════════════════════
# main.py — lifespan (startup + shutdown)
# ═══════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_lifespan_startup_and_shutdown():
    """Lifespan should call init_engine, create_pool, set_arq_pool on startup
    and close graph + reporting + engine on shutdown."""
    from app.main import lifespan

    mock_settings = MagicMock(
        redis_url="redis://localhost:6379/0",
        database_url="postgresql+asyncpg://test",
        db_pool_size=5,
        db_max_overflow=10,
    )
    mock_pool = AsyncMock(name="arq_pool")
    mock_graph = AsyncMock(name="graph_client")
    mock_reporting = MagicMock(name="reporting_service")

    fake_app = MagicMock(spec=FastAPI)

    with (
        patch("app.main.get_settings", return_value=mock_settings),
        patch("app.main.init_engine") as mock_init_engine,
        patch("app.main.create_pool", new_callable=AsyncMock, return_value=mock_pool) as mock_create_pool,
        patch("app.main.parse_redis_settings", return_value="redis_settings") as mock_parse,
        patch("app.main.set_arq_pool") as mock_set_pool,
        patch("app.main.get_graph_client", return_value=mock_graph),
        patch("app.main.get_reporting_service", return_value=mock_reporting),
        patch("app.main.dispose_engine", new_callable=AsyncMock) as mock_dispose,
    ):
        async with lifespan(fake_app):
            # Startup assertions
            mock_init_engine.assert_called_once_with(mock_settings)
            mock_parse.assert_called_once_with("redis://localhost:6379/0")
            mock_create_pool.assert_awaited_once_with("redis_settings")
            mock_set_pool.assert_called_once_with(mock_pool)

        # Shutdown assertions (after yield)
        mock_graph.close.assert_awaited_once()
        mock_reporting.close.assert_called_once()
        mock_dispose.assert_awaited_once()


@pytest.mark.asyncio
async def test_lifespan_handles_redis_failure():
    """When Redis is unavailable, lifespan should log a warning and continue."""
    from app.main import lifespan

    mock_settings = MagicMock(
        redis_url="redis://localhost:6379/0",
        database_url="postgresql+asyncpg://test",
        db_pool_size=5,
        db_max_overflow=10,
    )
    mock_graph = AsyncMock(name="graph_client")
    mock_reporting = MagicMock(name="reporting_service")

    fake_app = MagicMock(spec=FastAPI)

    with (
        patch("app.main.get_settings", return_value=mock_settings),
        patch("app.main.init_engine"),
        patch("app.main.create_pool", new_callable=AsyncMock, side_effect=ConnectionError("redis down")),
        patch("app.main.parse_redis_settings", return_value="redis_settings"),
        patch("app.main.set_arq_pool") as mock_set_pool,
        patch("app.main.get_graph_client", return_value=mock_graph),
        patch("app.main.get_reporting_service", return_value=mock_reporting),
        patch("app.main.dispose_engine", new_callable=AsyncMock),
    ):
        # Should NOT raise even though Redis connection failed
        async with lifespan(fake_app):
            mock_set_pool.assert_not_called()


@pytest.mark.asyncio
async def test_lifespan_handles_redis_os_error():
    """OSError during Redis connect should also be caught gracefully."""
    from app.main import lifespan

    mock_settings = MagicMock(redis_url="redis://bad:6379/0")
    mock_graph = AsyncMock()
    mock_reporting = MagicMock()
    fake_app = MagicMock(spec=FastAPI)

    with (
        patch("app.main.get_settings", return_value=mock_settings),
        patch("app.main.init_engine"),
        patch("app.main.create_pool", new_callable=AsyncMock, side_effect=OSError("connection refused")),
        patch("app.main.parse_redis_settings", return_value="rs"),
        patch("app.main.set_arq_pool") as mock_set_pool,
        patch("app.main.get_graph_client", return_value=mock_graph),
        patch("app.main.get_reporting_service", return_value=mock_reporting),
        patch("app.main.dispose_engine", new_callable=AsyncMock),
    ):
        async with lifespan(fake_app):
            mock_set_pool.assert_not_called()
