"""Label & policy management — create, update, delete with PowerShell fallback.

Graph API is tried first for all operations. When Graph returns a
"not supported" error (typically for label/policy creation and modification),
we fall back to PowerShell Compliance Center cmdlets.

This is separate from label_service.py, which handles label *reading* and
caching. This module handles label *writing* (CRUD).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.core.exceptions import GraphApiNotSupportedError, StableLabelError
from app.services.graph_client import GraphClient
from app.services.powershell_runner import CmdletResult, PowerShellRunner

logger = logging.getLogger(__name__)

# Graph error codes that indicate the operation is not supported
_UNSUPPORTED_CODES = frozenset({
    "Request_UnsupportedQuery",
    "notSupported",
    "NotSupported",
    "BadRequest",  # Graph sometimes returns 400 for unsupported label ops
})


@dataclass
class LabelConfig:
    """Configuration for creating or updating a sensitivity label."""

    name: str
    display_name: str = ""
    description: str = ""
    tooltip: str = ""
    color: str = ""
    priority: int = 0
    is_active: bool = True
    parent_id: str | None = None

    def to_graph_body(self) -> dict[str, Any]:
        """Convert to Graph API request body."""
        body: dict[str, Any] = {
            "name": self.name,
            "displayName": self.display_name or self.name,
            "isActive": self.is_active,
        }
        if self.description:
            body["description"] = self.description
        if self.tooltip:
            body["tooltip"] = self.tooltip
        if self.color:
            body["color"] = self.color
        if self.parent_id:
            body["parent"] = {"labelId": self.parent_id}
        return body

    def to_powershell_params(self) -> dict[str, Any]:
        """Convert to PowerShell cmdlet parameters."""
        params: dict[str, Any] = {
            "Name": self.name,
            "DisplayName": self.display_name or self.name,
        }
        if self.description:
            params["Comment"] = self.description
        if self.tooltip:
            params["Tooltip"] = self.tooltip
        if self.parent_id:
            params["ParentId"] = self.parent_id
        return params


@dataclass
class PolicyConfig:
    """Configuration for creating or updating a label policy."""

    name: str
    description: str = ""
    labels: list[str] | None = None  # label GUIDs to include
    users: list[str] | None = None  # user/group scope (empty = all)
    is_enabled: bool = True

    def to_graph_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "name": self.name,
            "isEnabled": self.is_enabled,
        }
        if self.description:
            body["description"] = self.description
        if self.labels:
            body["labels"] = [{"labelId": lid} for lid in self.labels]
        return body

    def to_powershell_params(self) -> dict[str, Any]:
        params: dict[str, Any] = {"Name": self.name}
        if self.description:
            params["Comment"] = self.description
        if self.labels:
            params["Labels"] = self.labels
        if self.users:
            params["ExchangeLocation"] = self.users
        return params


class LabelManagementService:
    """Create, update, and delete sensitivity labels and policies.

    Tries Graph API first, falls back to PowerShell for unsupported ops.
    """

    def __init__(
        self,
        graph: GraphClient,
        powershell: PowerShellRunner,
    ) -> None:
        self._graph = graph
        self._ps = powershell

    # ── Label operations ────────────────────────────────────────

    async def create_label(
        self,
        tenant_id: str,
        config: LabelConfig,
    ) -> dict[str, Any]:
        """Create a new sensitivity label."""
        try:
            body, status, _ = await self._graph.post(
                tenant_id,
                "/security/informationProtection/sensitivityLabels",
                json=config.to_graph_body(),
            )
            if status in (200, 201):
                return body
            raise GraphApiNotSupportedError(
                f"Graph returned {status} for label creation"
            )
        except (GraphApiNotSupportedError, StableLabelError) as exc:
            if not self._is_unsupported_error(exc):
                raise
            logger.info(
                "Graph API does not support label creation, falling back to PowerShell"
            )
            return await self._ps_create_label(tenant_id, config)

    async def update_label(
        self,
        tenant_id: str,
        label_id: str,
        config: LabelConfig,
    ) -> dict[str, Any]:
        """Update an existing sensitivity label."""
        try:
            body, status, _ = await self._graph.post(
                tenant_id,
                f"/security/informationProtection/sensitivityLabels/{label_id}",
                json=config.to_graph_body(),
            )
            if status in (200, 204):
                return body
            raise GraphApiNotSupportedError(
                f"Graph returned {status} for label update"
            )
        except (GraphApiNotSupportedError, StableLabelError) as exc:
            if not self._is_unsupported_error(exc):
                raise
            logger.info(
                "Graph API does not support label update, falling back to PowerShell"
            )
            params = config.to_powershell_params()
            params["Identity"] = label_id
            result = await self._ps.invoke("Set-Label", params, tenant_id)
            return result.data if isinstance(result.data, dict) else {}

    async def delete_label(
        self,
        tenant_id: str,
        label_id: str,
    ) -> None:
        """Delete a sensitivity label."""
        try:
            await self._graph.post(
                tenant_id,
                f"/security/informationProtection/sensitivityLabels/{label_id}/delete",
            )
            return
        except (GraphApiNotSupportedError, StableLabelError) as exc:
            if not self._is_unsupported_error(exc):
                raise
            logger.info(
                "Graph API does not support label deletion, falling back to PowerShell"
            )
            await self._ps.invoke(
                "Remove-Label",
                {"Identity": label_id, "Confirm": False},
                tenant_id,
            )

    # ── Policy operations ───────────────────────────────────────

    async def create_policy(
        self,
        tenant_id: str,
        config: PolicyConfig,
    ) -> dict[str, Any]:
        """Create a new label policy."""
        try:
            body, status, _ = await self._graph.post(
                tenant_id,
                "/security/informationProtection/labelPolicies",
                json=config.to_graph_body(),
            )
            if status in (200, 201):
                return body
            raise GraphApiNotSupportedError(
                f"Graph returned {status} for policy creation"
            )
        except (GraphApiNotSupportedError, StableLabelError) as exc:
            if not self._is_unsupported_error(exc):
                raise
            logger.info(
                "Graph API does not support policy creation, falling back to PowerShell"
            )
            result = await self._ps.invoke(
                "New-LabelPolicy",
                config.to_powershell_params(),
                tenant_id,
            )
            return result.data if isinstance(result.data, dict) else {}

    async def update_policy(
        self,
        tenant_id: str,
        policy_id: str,
        config: PolicyConfig,
    ) -> dict[str, Any]:
        """Update an existing label policy."""
        try:
            body, status, _ = await self._graph.post(
                tenant_id,
                f"/security/informationProtection/labelPolicies/{policy_id}",
                json=config.to_graph_body(),
            )
            if status in (200, 204):
                return body
            raise GraphApiNotSupportedError(
                f"Graph returned {status} for policy update"
            )
        except (GraphApiNotSupportedError, StableLabelError) as exc:
            if not self._is_unsupported_error(exc):
                raise
            logger.info(
                "Graph API does not support policy update, falling back to PowerShell"
            )
            params = config.to_powershell_params()
            params["Identity"] = policy_id
            result = await self._ps.invoke("Set-LabelPolicy", params, tenant_id)
            return result.data if isinstance(result.data, dict) else {}

    # ── Helpers ─────────────────────────────────────────────────

    async def _ps_create_label(
        self,
        tenant_id: str,
        config: LabelConfig,
    ) -> dict[str, Any]:
        """Create a label via PowerShell New-Label."""
        result = await self._ps.invoke(
            "New-Label",
            config.to_powershell_params(),
            tenant_id,
        )
        return result.data if isinstance(result.data, dict) else {}

    @staticmethod
    def _is_unsupported_error(exc: Exception) -> bool:
        """Check if an error indicates the Graph API doesn't support this operation."""
        if isinstance(exc, GraphApiNotSupportedError):
            return True
        msg = str(exc)
        return any(code in msg for code in _UNSUPPORTED_CODES)
