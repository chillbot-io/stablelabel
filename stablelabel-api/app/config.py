"""Application settings — loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All config comes from env vars — no secrets in code."""

    # Azure AD app registration
    azure_client_id: str = ""
    azure_client_secret: str = ""

    # Rate limiting defaults (per-tenant)
    graph_rate_limit: float = 5.0  # requests/sec
    graph_rate_burst: float = 10.0  # burst capacity

    # Bulk operation limits
    bulk_max_concurrent: int = 8  # max parallel label ops per tenant
    bulk_verify_delay: float = 2.0  # seconds to wait before verification

    # Label cache
    label_cache_ttl: float = 1800.0  # 30 min

    # Classifier (optional)
    classifier_enabled: bool = False

    model_config = {"env_prefix": "SL_"}
