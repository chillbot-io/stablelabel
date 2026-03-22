"""Pydantic models for document labeling operations."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class AssignmentMethod(StrEnum):
    STANDARD = "standard"
    PRIVILEGED = "privileged"


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    SILENT_FAILURE = "silent_failure"  # 202 accepted but label never applied


class DocumentLabel(BaseModel):
    """Current label state of a document, from extractSensitivityLabels."""

    sensitivity_label_id: str
    assignment_method: str = ""
    tenant_id: str = ""


class LabelAssignment(BaseModel):
    """Request to apply a label to a single file."""

    drive_id: str
    item_id: str
    sensitivity_label_id: str
    assignment_method: AssignmentMethod = AssignmentMethod.STANDARD
    justification_text: str = ""


class BulkLabelRequest(BaseModel):
    """Request to apply a label to multiple files."""

    tenant_id: str
    sensitivity_label_id: str
    assignment_method: AssignmentMethod = AssignmentMethod.STANDARD
    justification_text: str = ""
    items: list[BulkItem] = Field(default_factory=list)
    confirm_encryption: bool = False  # Must be True if label has protection
    dry_run: bool = False


class BulkItem(BaseModel):
    """Single item in a bulk labeling request."""

    drive_id: str
    item_id: str
    filename: str  # for file-type validation client-side


# Fix forward reference
BulkLabelRequest.model_rebuild()


class LabelJobResult(BaseModel):
    """Result of a single file's labeling operation."""

    drive_id: str
    item_id: str
    filename: str
    status: JobStatus = JobStatus.PENDING
    error: str = ""
    location_url: str = ""  # for polling async operation
    verified: bool = False  # True after re-extract confirms label applied


class BulkLabelResponse(BaseModel):
    """Response for a bulk labeling operation."""

    job_id: str
    tenant_id: str
    label_id: str
    label_has_protection: bool = False
    dry_run: bool = False
    total: int = 0
    completed: int = 0
    failed: int = 0
    skipped: int = 0
    results: list[LabelJobResult] = Field(default_factory=list)
