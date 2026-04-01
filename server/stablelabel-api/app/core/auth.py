"""MSAL token acquisition for Graph API.

Supports two flows:
  - Client credentials (app-only): for file labeling, label reads
  - Device code (delegated): for site container labels (app-only blocked)

Tokens are cached per-tenant for multi-tenant MSP scenarios.
"""

from __future__ import annotations

import logging
from typing import Any

import msal

logger = logging.getLogger(__name__)

# Scopes for app-only (client credentials) — .default requests all consented app perms
GRAPH_APP_SCOPE = ["https://graph.microsoft.com/.default"]


class TokenManager:
    """Manages MSAL confidential client apps, one per tenant."""

    def __init__(self, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._apps: dict[str, msal.ConfidentialClientApplication] = {}

    def _get_app(self, tenant_id: str) -> msal.ConfidentialClientApplication:
        if tenant_id not in self._apps:
            self._apps[tenant_id] = msal.ConfidentialClientApplication(
                client_id=self._client_id,
                client_credential=self._client_secret,
                authority=f"https://login.microsoftonline.com/{tenant_id}",
            )
        return self._apps[tenant_id]

    def acquire_token(self, tenant_id: str) -> str:
        """Get an access token for the given tenant (client credentials flow).

        Returns the bearer token string.
        Raises GraphAuthError on failure.
        """
        from app.core.exceptions import GraphAuthError

        app = self._get_app(tenant_id)
        result: dict[str, Any] = app.acquire_token_for_client(scopes=GRAPH_APP_SCOPE)

        if "access_token" in result:
            return result["access_token"]

        error = result.get("error_description", result.get("error", "unknown"))
        raise GraphAuthError(f"Token acquisition failed for tenant {tenant_id}: {error}")
