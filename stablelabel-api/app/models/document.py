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
    justification_text: str = Field(default="", max_length=1000)
    items: list[BulkItem] = Field(default_factory=list, max_length=10000)
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


class RemoveLabelRequest(BaseModel):
    """Request to remove a label from a single file."""

    drive_id: str
    item_id: str


class RemovalMode(StrEnum):
    LABEL_ONLY = "label_only"
    ENCRYPTION_ONLY = "encryption_only"
    LABEL_AND_ENCRYPTION = "label_and_encryption"


class BulkRemoveRequest(BaseModel):
    """Request to remove labels from multiple files."""

    tenant_id: str
    items: list[BulkItem] = Field(default_factory=list, max_length=10000)
    mode: RemovalMode = RemovalMode.LABEL_ONLY
    dry_run: bool = False


class BulkRemoveResponse(BaseModel):
    """Response for a bulk removal operation."""

    job_id: str
    tenant_id: str
    mode: str
    dry_run: bool = False
    total: int = 0
    completed: int = 0
    failed: int = 0
    results: list[LabelJobResult] = Field(default_factory=list)


class CsvUploadResult(BaseModel):
    """Response for CSV upload labeling.

    Returns immediately with parse results. Use the job_ids to track
    progress via the SSE endpoint: GET /tenants/{id}/jobs/{job_id}/progress
    """

    total_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    errors: list[str] = Field(default_factory=list)
    job_ids: list[str] = Field(default_factory=list)
