"""StableLabel API — FastAPI entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.base import dispose_engine, init_engine
from app.dependencies import get_graph_client, get_settings, set_arq_pool
from app.routers import audit, documents, health, jobs, labels, onboard, policies, tenants, users

logger = logging.getLogger(__name__)


def _parse_redis_settings(url: str) -> RedisSettings:
    """Parse a redis:// URL into arq RedisSettings."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or "0"),
        password=parsed.password,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: initialise database + Redis connection pools
    settings = get_settings()
    init_engine(settings)

    try:
        arq_pool = await create_pool(_parse_redis_settings(settings.redis_url))
        set_arq_pool(arq_pool)
        logger.info("Connected to Redis for arq task queue")
    except Exception:
        logger.warning("Redis not available — job dispatch will fail until Redis is running")

    yield

    # Shutdown: close connections
    graph = get_graph_client()
    await graph.close()
    await dispose_engine()


app = FastAPI(
    title="StableLabel API",
    version="0.1.0",
    description="Autolabelling backend — Graph API-driven sensitivity label management for MSPs",
    lifespan=lifespan,
)

# CORS for Vite SPA (dev: localhost:5173, prod: configured domain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(labels.router)
app.include_router(documents.router)
app.include_router(tenants.router)
app.include_router(onboard.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(jobs.router)
app.include_router(policies.router)
