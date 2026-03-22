"""SQLAlchemy ORM models — all persistent state for StableLabel SaaS.

Tables:
  - msp_tenants: MSP organisations that sign in via Entra
  - customer_tenants: Customer M365 tenants managed by an MSP
  - users: JIT-provisioned from Entra ID tokens
  - user_tenant_access: Which customer tenants a non-Admin can see
  - jobs: Labelling job definitions and state
  - job_checkpoints: Durable progress markers for resume-after-crash
  - policies: Classification-to-label mapping rules
  - label_definitions: Cached sensitivity labels per customer tenant
  - audit_events: Immutable log of all significant actions
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Shared base for all models."""

    type_annotation_map = {
        dict: JSONB,
    }


# ---------------------------------------------------------------------------
# Tenants
# ---------------------------------------------------------------------------


class MspTenant(Base):
    """An MSP organisation — identified by their Entra tenant ID."""

    __tablename__ = "msp_tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entra_tenant_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # relationships
    customer_tenants: Mapped[list[CustomerTenant]] = relationship(back_populates="msp_tenant")
    users: Mapped[list[User]] = relationship(back_populates="msp_tenant")


class CustomerTenant(Base):
    """A customer M365 tenant connected by an MSP via admin consent."""

    __tablename__ = "customer_tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    msp_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("msp_tenants.id", ondelete="CASCADE"), nullable=False
    )
    entra_tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    consent_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | active | revoked
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("msp_tenant_id", "entra_tenant_id", name="uq_msp_customer_tenant"),
    )

    # relationships
    msp_tenant: Mapped[MspTenant] = relationship(back_populates="customer_tenants")
    jobs: Mapped[list[Job]] = relationship(back_populates="customer_tenant")
    label_definitions: Mapped[list[LabelDefinition]] = relationship(
        back_populates="customer_tenant"
    )


# ---------------------------------------------------------------------------
# Users & Access
# ---------------------------------------------------------------------------


class User(Base):
    """A user JIT-provisioned from an Entra ID token on first sign-in."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    msp_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("msp_tenants.id", ondelete="CASCADE"), nullable=False
    )
    entra_oid: Mapped[str] = mapped_column(String(36), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # Admin | Operator | Viewer
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("msp_tenant_id", "entra_oid", name="uq_msp_user_oid"),
    )

    # relationships
    msp_tenant: Mapped[MspTenant] = relationship(back_populates="users")
    tenant_access: Mapped[list[UserTenantAccess]] = relationship(back_populates="user")


class UserTenantAccess(Base):
    """Grant a non-Admin user access to a specific customer tenant."""

    __tablename__ = "user_tenant_access"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    customer_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str] = mapped_column(String(320), nullable=False)  # email of granting admin

    __table_args__ = (
        UniqueConstraint("user_id", "customer_tenant_id", name="uq_user_tenant"),
    )

    # relationships
    user: Mapped[User] = relationship(back_populates="tenant_access")
    customer_tenant: Mapped[CustomerTenant] = relationship()


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


class Job(Base):
    """A labelling job — the central unit of work."""

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | enumerating | running | paused | completed | failed | rolled_back
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    processed_files: Mapped[int] = mapped_column(Integer, default=0)
    failed_files: Mapped[int] = mapped_column(Integer, default=0)
    skipped_files: Mapped[int] = mapped_column(Integer, default=0)
    schedule_cron: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_jobs_tenant_status", "customer_tenant_id", "status"),
    )

    # relationships
    customer_tenant: Mapped[CustomerTenant] = relationship(back_populates="jobs")
    creator: Mapped[User] = relationship()
    checkpoints: Mapped[list[JobCheckpoint]] = relationship(
        back_populates="job", order_by="JobCheckpoint.batch_number"
    )


class JobCheckpoint(Base):
    """Durable progress marker — jobs resume from last committed checkpoint."""

    __tablename__ = "job_checkpoints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    batch_number: Mapped[int] = mapped_column(Integer, nullable=False)
    file_ids: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # completed | failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("job_id", "batch_number", name="uq_job_batch"),
    )

    # relationships
    job: Mapped[Job] = relationship(back_populates="checkpoints")


# ---------------------------------------------------------------------------
# Policies (classification → label mapping)
# ---------------------------------------------------------------------------


class Policy(Base):
    """A classification-to-label mapping rule.

    Example: "If PCI detected with confidence > 0.8 → apply Highly Confidential"
    """

    __tablename__ = "policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    target_label_id: Mapped[str] = mapped_column(String(36), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # relationships
    customer_tenant: Mapped[CustomerTenant] = relationship()


# ---------------------------------------------------------------------------
# Label cache
# ---------------------------------------------------------------------------


class LabelDefinition(Base):
    """Cached sensitivity label from Graph API, per customer tenant."""

    __tablename__ = "label_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False
    )
    graph_label_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String(20), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    has_protection: Mapped[bool] = mapped_column(Boolean, default=False)
    applicable_to: Mapped[dict] = mapped_column(JSONB, default=list)
    parent_id: Mapped[str | None] = mapped_column(String(36))
    is_parent: Mapped[bool] = mapped_column(Boolean, default=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "customer_tenant_id", "graph_label_id", name="uq_tenant_label"
        ),
        Index("ix_labels_tenant", "customer_tenant_id"),
    )

    # relationships
    customer_tenant: Mapped[CustomerTenant] = relationship(back_populates="label_definitions")


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class AuditEvent(Base):
    """Immutable audit log entry. Partitioned by month in production."""

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    msp_tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("msp_tenants.id"), nullable=False
    )
    customer_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customer_tenants.id")
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_file: Mapped[str | None] = mapped_column(Text)
    target_site: Mapped[str | None] = mapped_column(String(500))
    label_applied: Mapped[str | None] = mapped_column(String(36))
    previous_label: Mapped[str | None] = mapped_column(String(36))
    extra: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_audit_tenant_time", "msp_tenant_id", "created_at"),
        Index("ix_audit_job", "job_id"),
        Index("ix_audit_event_type", "event_type"),
    )
