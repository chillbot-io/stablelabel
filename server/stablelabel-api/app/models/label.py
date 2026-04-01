"""Pydantic models for sensitivity labels."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class LabelApplicableTo(StrEnum):
    FILE = "file"
    EMAIL = "email"
    SITE = "site"
    UNIFIED_GROUP = "unifiedGroup"
    SCHEMA_EXTENSIONS = "schemaExtensions"


class SensitivityLabel(BaseModel):
    """Cached representation of a tenant's sensitivity label."""

    id: str
    name: str
    display_name: str = ""
    description: str = ""
    priority: int = 0
    color: str = ""
    is_active: bool = True
    has_protection: bool = False  # THE encryption guard flag
    applicable_to: list[str] = Field(default_factory=list)
    parent_id: str | None = None
    is_parent: bool = False  # True = has children, cannot be applied directly


class LabelCache(BaseModel):
    """Snapshot of a tenant's labels with TTL tracking."""

    tenant_id: str
    labels: list[SensitivityLabel] = Field(default_factory=list)
    fetched_at: float = 0.0  # monotonic timestamp
    ttl_seconds: float = 1800.0  # 30 min default, same as PS module

    def is_stale(self, now: float) -> bool:
        return (now - self.fetched_at) > self.ttl_seconds
