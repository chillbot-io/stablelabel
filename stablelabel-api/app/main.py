"""StableLabel API — FastAPI entry point."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.base import dispose_engine, init_engine
from app.dependencies import get_graph_client, get_settings
from app.routers import audit, documents, health, jobs, labels, tenants, users


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: initialise database connection pool
    settings = get_settings()
    init_engine(settings)
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
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(jobs.router)
