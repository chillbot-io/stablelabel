"""architecture hardening — consent flow, checkpoint granularity, job lifecycle

Revision ID: a7f2c1d83e01
Revises: 4d5bc3beec87
Create Date: 2026-03-22

Adds:
  - customer_tenants.consent_requested_at for tracking consent flow timing
  - customer_tenants.consent_status now includes 'consent_denied'
  - jobs.source_job_id for retry-as-copy lineage
  - job_checkpoints.checkpoint_type (enumeration|labelling|rollback)
  - job_checkpoints.scope_cursor (JSONB position in scan tree)
  - job_checkpoints.items_processed / items_failed counters
  - Removes old file_ids column (replaced by scope_cursor)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a7f2c1d83e01"
down_revision: Union[str, Sequence[str]] = "4d5bc3beec87"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Customer Tenants: consent flow fields ──────────────
    op.add_column(
        "customer_tenants",
        sa.Column("consent_requested_at", sa.DateTime(timezone=True)),
    )

    # ── Jobs: retry-as-copy lineage ────────────────────────
    op.add_column(
        "jobs",
        sa.Column(
            "source_job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id"),
            nullable=True,
        ),
    )

    # ── Job Checkpoints: granular resume support ───────────
    op.add_column(
        "job_checkpoints",
        sa.Column("checkpoint_type", sa.String(20), nullable=False, server_default="labelling"),
    )
    op.add_column(
        "job_checkpoints",
        sa.Column("scope_cursor", postgresql.JSONB, nullable=False, server_default="{}"),
    )
    op.add_column(
        "job_checkpoints",
        sa.Column("items_processed", sa.Integer, server_default="0"),
    )
    op.add_column(
        "job_checkpoints",
        sa.Column("items_failed", sa.Integer, server_default="0"),
    )
    # Remove old file_ids column (data now lives in scope_cursor)
    op.drop_column("job_checkpoints", "file_ids")


def downgrade() -> None:
    # ── Job Checkpoints: restore old schema ────────────────
    op.add_column(
        "job_checkpoints",
        sa.Column("file_ids", postgresql.JSONB, nullable=False, server_default="[]"),
    )
    op.drop_column("job_checkpoints", "items_failed")
    op.drop_column("job_checkpoints", "items_processed")
    op.drop_column("job_checkpoints", "scope_cursor")
    op.drop_column("job_checkpoints", "checkpoint_type")

    # ── Jobs ───────────────────────────────────────────────
    op.drop_column("jobs", "source_job_id")

    # ── Customer Tenants ───────────────────────────────────
    op.drop_column("customer_tenants", "consent_requested_at")
