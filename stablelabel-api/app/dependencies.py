"""FastAPI dependency injection — wires up services."""

from __future__ import annotations

from functools import lru_cache
from typing import AsyncIterator

from arq import ArqRedis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.auth import TokenManager
from app.db.base import get_session
from app.services.document_service import DocumentService
from app.services.graph_client import GraphClient
from app.services.label_service import LabelService
from app.services.reporting import ReportingService

# Module-level arq pool — set during app lifespan startup
_arq_pool: ArqRedis | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_token_manager() -> TokenManager:
    s = get_settings()
    return TokenManager(client_id=s.azure_client_id, client_secret=s.azure_client_secret)


@lru_cache
def get_graph_client() -> GraphClient:
    s = get_settings()
    return GraphClient(
        token_manager=get_token_manager(),
        rate_limit=s.graph_rate_limit,
        rate_burst=s.graph_rate_burst,
    )


@lru_cache
def get_label_service() -> LabelService:
    return LabelService(graph=get_graph_client(), settings=get_settings())


@lru_cache
def get_document_service() -> DocumentService:
    return DocumentService(
        graph=get_graph_client(),
        labels=get_label_service(),
        settings=get_settings(),
    )


@lru_cache
def get_reporting_service() -> ReportingService:
    return ReportingService(database_url=get_settings().database_url)


def set_arq_pool(pool: ArqRedis) -> None:
    """Called during app startup to set the arq connection pool."""
    global _arq_pool
    _arq_pool = pool


async def get_arq_pool() -> ArqRedis:
    """FastAPI dependency: returns the arq Redis connection pool."""
    if _arq_pool is None:
        raise RuntimeError("arq pool not initialized — is Redis running?")
    return _arq_pool


async def get_db() -> AsyncIterator[AsyncSession]:
    """Alias for get_session — used in route dependencies."""
    async for session in get_session():
        yield session
