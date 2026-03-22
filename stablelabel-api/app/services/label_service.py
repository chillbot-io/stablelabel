"""Label service — cached label inventory with encryption guard and priority tracking.

This is the brain that knows about label metadata.  Every labeling operation
should consult this service before calling Graph to apply a label.
"""

from __future__ import annotations

import logging
import time

from app.config import Settings
from app.core.exceptions import (
    EncryptionLabelGuardError,
    LabelDowngradeError,
    LabelNotFoundError,
)
from app.models.label import LabelCache, SensitivityLabel
from app.services.graph_client import GraphClient

logger = logging.getLogger(__name__)


class LabelService:
    """Manages label inventory per tenant with caching."""

    def __init__(self, graph: GraphClient, settings: Settings) -> None:
        self._graph = graph
        self._caches: dict[str, LabelCache] = {}
        self._label_cache_ttl = settings.label_cache_ttl

    async def get_labels(self, tenant_id: str, *, force: bool = False) -> list[SensitivityLabel]:
        """Get all sensitivity labels for a tenant, cached with 30-min TTL."""
        cache = self._caches.get(tenant_id)
        now = time.monotonic()

        if cache and not cache.is_stale(now) and not force:
            return cache.labels

        raw_labels = await self._graph.get_all_pages(
            tenant_id,
            "/security/dataSecurityAndGovernance/sensitivityLabels",
        )

        labels = [self._parse_label(raw) for raw in raw_labels]
        self._mark_parents(labels)

        self._caches[tenant_id] = LabelCache(
            tenant_id=tenant_id,
            labels=labels,
            fetched_at=now,
            ttl_seconds=self._label_cache_ttl,
        )
        logger.info("Refreshed %d labels for tenant %s", len(labels), tenant_id)
        return labels

    async def get_label(self, tenant_id: str, label_id: str) -> SensitivityLabel:
        """Get a specific label by ID, raising if not found/disabled."""
        labels = await self.get_labels(tenant_id)
        for lb in labels:
            if lb.id == label_id:
                if not lb.is_active:
                    raise LabelNotFoundError(
                        f"Label {label_id} exists but is disabled/inactive"
                    )
                return lb
        raise LabelNotFoundError(f"Label {label_id} not found in tenant {tenant_id}")

    async def get_appliable_labels(self, tenant_id: str) -> list[SensitivityLabel]:
        """Labels that can actually be applied to files — active, leaf, file-scoped."""
        labels = await self.get_labels(tenant_id)
        return [
            lb for lb in labels
            if lb.is_active and not lb.is_parent and "file" in lb.applicable_to
        ]

    def check_encryption_guard(
        self, label: SensitivityLabel, *, confirmed: bool = False
    ) -> None:
        """Block bulk application of encryption labels unless explicitly confirmed.

        This is the #1 risk at scale.  Accidentally encrypting thousands of
        files can lock out users org-wide.
        """
        if label.has_protection and not confirmed:
            raise EncryptionLabelGuardError(
                f"Label '{label.display_name}' ({label.id}) has encryption/protection. "
                f"Applying at scale will encrypt files and may break existing sharing. "
                f"Set confirm_encryption=True to proceed."
            )

    def check_downgrade(
        self,
        current_label: SensitivityLabel | None,
        target_label: SensitivityLabel,
        *,
        justification: str = "",
        assignment_method: str = "standard",
    ) -> None:
        """Check if this is a label downgrade and enforce justification.

        Using assignment_method='privileged' bypasses this — but that shows
        in audit logs, so callers should be aware.
        """
        if current_label is None:
            return  # no current label — always allowed

        if assignment_method == "privileged":
            return  # administrative override

        if target_label.priority < current_label.priority and not justification:
            raise LabelDowngradeError(
                f"Downgrade from '{current_label.display_name}' (priority {current_label.priority}) "
                f"to '{target_label.display_name}' (priority {target_label.priority}) "
                f"requires justification_text or assignment_method='privileged'."
            )

    # ── Parsing ───────────────────────────────────────────────────

    @staticmethod
    def _parse_label(raw: dict) -> SensitivityLabel:  # type: ignore[type-arg]
        """Parse a Graph sensitivityLabel resource into our model."""
        applicable = raw.get("applicableTo", "")
        # Graph returns this as a comma-separated string, e.g. "file,email"
        applicable_list = [a.strip().lower() for a in applicable.split(",")] if applicable else []

        return SensitivityLabel(
            id=raw.get("id", ""),
            name=raw.get("name", ""),
            display_name=raw.get("displayName", raw.get("name", "")),
            description=raw.get("description", ""),
            priority=raw.get("priority", 0),
            color=raw.get("color", ""),
            is_active=raw.get("isEnabled", True),
            has_protection=raw.get("hasProtection", False),
            applicable_to=applicable_list,
            parent_id=raw.get("parent", {}).get("id") if raw.get("parent") else None,
        )

    @staticmethod
    def _mark_parents(labels: list[SensitivityLabel]) -> None:
        """Identify parent labels (cannot be applied directly — leaf only)."""
        parent_ids = {lb.parent_id for lb in labels if lb.parent_id}
        for lb in labels:
            if lb.id in parent_ids:
                lb.is_parent = True
