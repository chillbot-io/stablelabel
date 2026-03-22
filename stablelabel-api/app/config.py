"""Application settings — loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All config comes from env vars — no secrets in code."""

    # ── Database ──────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://stablelabel:stablelabel@localhost:5432/stablelabel"
    db_pool_size: int = 5
    db_max_overflow: int = 10

    # ── Entra ID — Auth app (user sign-in) ────────────────────
    entra_auth_client_id: str = ""  # "StableLabel" app registration
    entra_auth_tenant_id: str = "common"  # multi-tenant

    # ── Entra ID — Data Connector app (Graph API access) ──────
    azure_client_id: str = ""  # "StableLabel Data Connector" app reg
    azure_client_secret: str = ""

    # ── Session ───────────────────────────────────────────────
    session_secret: str = "change-me-in-production"  # for signing session cookies
    session_max_age: int = 28800  # 8 hours

    # ── Rate limiting defaults (per-tenant) ───────────────────
    graph_rate_limit: float = 5.0  # requests/sec
    graph_rate_burst: float = 10.0  # burst capacity

    # ── Bulk operation limits ─────────────────────────────────
    bulk_max_concurrent: int = 8  # max parallel label ops per tenant
    bulk_verify_delay: float = 2.0  # seconds to wait before verification

    # ── Label cache ───────────────────────────────────────────
    label_cache_ttl: float = 1800.0  # 30 min

    # ── Classifier (optional) ─────────────────────────────────
    classifier_enabled: bool = False

    model_config = {"env_prefix": "SL_"}
