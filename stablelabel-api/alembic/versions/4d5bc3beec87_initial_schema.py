"""initial schema

Revision ID: 4d5bc3beec87
Revises:
Create Date: 2026-03-22 21:10:35.064569

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "4d5bc3beec87"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── MSP Tenants ──────────────────────────────────────────
    op.create_table(
        "msp_tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entra_tenant_id", sa.String(36), unique=True, nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # ── Customer Tenants ─────────────────────────────────────
    op.create_table(
        "customer_tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "msp_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("msp_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entra_tenant_id", sa.String(36), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("consent_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("consented_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("msp_tenant_id", "entra_tenant_id", name="uq_msp_customer_tenant"),
    )

    # ── Users ────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "msp_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("msp_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entra_oid", sa.String(36), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column(
            "first_seen",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_seen",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("msp_tenant_id", "entra_oid", name="uq_msp_user_oid"),
    )

    # ── User Tenant Access ───────────────────────────────────
    op.create_table(
        "user_tenant_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("created_by", sa.String(320), nullable=False),
        sa.UniqueConstraint("user_id", "customer_tenant_id", name="uq_user_tenant"),
    )

    # ── Jobs ─────────────────────────────────────────────────
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "customer_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("config", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("total_files", sa.Integer, server_default="0"),
        sa.Column("processed_files", sa.Integer, server_default="0"),
        sa.Column("failed_files", sa.Integer, server_default="0"),
        sa.Column("skipped_files", sa.Integer, server_default="0"),
        sa.Column("schedule_cron", sa.String(100)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_jobs_tenant_status", "jobs", ["customer_tenant_id", "status"])

    # ── Job Checkpoints ──────────────────────────────────────
    op.create_table(
        "job_checkpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("batch_number", sa.Integer, nullable=False),
        sa.Column("file_ids", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("job_id", "batch_number", name="uq_job_batch"),
    )

    # ── Policies ─────────────────────────────────────────────
    op.create_table(
        "policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "customer_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_builtin", sa.Boolean, server_default="false"),
        sa.Column("is_enabled", sa.Boolean, server_default="true"),
        sa.Column("rules", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("target_label_id", sa.String(36), nullable=False),
        sa.Column("priority", sa.Integer, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # ── Label Definitions ────────────────────────────────────
    op.create_table(
        "label_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "customer_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("graph_label_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("priority", sa.Integer, server_default="0"),
        sa.Column("color", sa.String(20), server_default=""),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("has_protection", sa.Boolean, server_default="false"),
        sa.Column("applicable_to", postgresql.JSONB, server_default="[]"),
        sa.Column("parent_id", sa.String(36)),
        sa.Column("is_parent", sa.Boolean, server_default="false"),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "customer_tenant_id", "graph_label_id", name="uq_tenant_label"
        ),
    )
    op.create_index("ix_labels_tenant", "label_definitions", ["customer_tenant_id"])

    # ── Audit Events ─────────────────────────────────────────
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "msp_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("msp_tenants.id"),
            nullable=False,
        ),
        sa.Column(
            "customer_tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customer_tenants.id"),
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id"),
        ),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("target_file", sa.Text),
        sa.Column("target_site", sa.String(500)),
        sa.Column("label_applied", sa.String(36)),
        sa.Column("previous_label", sa.String(36)),
        sa.Column("extra", postgresql.JSONB),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_tenant_time", "audit_events", ["msp_tenant_id", "created_at"])
    op.create_index("ix_audit_job", "audit_events", ["job_id"])
    op.create_index("ix_audit_event_type", "audit_events", ["event_type"])


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("label_definitions")
    op.drop_table("policies")
    op.drop_table("job_checkpoints")
    op.drop_table("jobs")
    op.drop_table("user_tenant_access")
    op.drop_table("users")
    op.drop_table("customer_tenants")
    op.drop_table("msp_tenants")
