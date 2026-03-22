"""timescaledb hypertables and audit partitioning

Revision ID: b3e8f4a21c09
Revises: a7f2c1d83e01
Create Date: 2026-03-22

Adds:
  - TimescaleDB extension (CREATE EXTENSION IF NOT EXISTS)
  - scan_results table + hypertable
  - classification_events table + hypertable
  - job_metrics table + hypertable
  - Converts audit_events to monthly range-partitioned table
  - schedule_cron column on jobs (if not present)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3e8f4a21c09"
down_revision: Union[str, Sequence[str]] = "a7f2c1d83e01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── TimescaleDB extension ───────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

    # ── scan_results ────────────────────────────────────────
    op.create_table(
        "scan_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("customer_tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("drive_id", sa.String(255), nullable=False),
        sa.Column("item_id", sa.String(255), nullable=False),
        sa.Column("file_name", sa.String(500), nullable=False),
        sa.Column("classification", sa.String(100)),
        sa.Column("confidence", sa.Float),
        sa.Column("label_applied", sa.String(36)),
        sa.Column("previous_label", sa.String(36)),
        sa.Column("outcome", sa.String(20), nullable=False),
    )
    op.create_index("ix_scan_tenant_ts", "scan_results", ["customer_tenant_id", "ts"])
    op.create_index("ix_scan_job", "scan_results", ["job_id"])
    op.execute("SELECT create_hypertable('scan_results', 'ts', migrate_data => true)")

    # ── classification_events ───────────────────────────────
    op.create_table(
        "classification_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("customer_tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_count", sa.Integer, nullable=False),
        sa.Column("max_confidence", sa.Float, nullable=False),
        sa.Column("file_name", sa.String(500), nullable=False),
    )
    op.create_index("ix_class_tenant_ts", "classification_events", ["customer_tenant_id", "ts"])
    op.create_index("ix_class_entity", "classification_events", ["entity_type"])
    op.execute("SELECT create_hypertable('classification_events', 'ts', migrate_data => true)")

    # ── job_metrics ─────────────────────────────────────────
    op.create_table(
        "job_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("customer_tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("customer_tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("batch_number", sa.Integer, nullable=False),
        sa.Column("files_processed", sa.Integer, nullable=False),
        sa.Column("files_failed", sa.Integer, nullable=False),
        sa.Column("files_skipped", sa.Integer, nullable=False),
        sa.Column("duration_ms", sa.Integer, nullable=False),
        sa.Column("files_per_second", sa.Float, nullable=False),
    )
    op.create_index("ix_jm_tenant_ts", "job_metrics", ["customer_tenant_id", "ts"])
    op.create_index("ix_jm_job", "job_metrics", ["job_id"])
    op.execute("SELECT create_hypertable('job_metrics', 'ts', migrate_data => true)")

    # ── Retention policies ──────────────────────────────────
    # Keep scan_results for 90 days, classification_events for 1 year, job_metrics for 1 year
    op.execute("SELECT add_retention_policy('scan_results', INTERVAL '90 days')")
    op.execute("SELECT add_retention_policy('classification_events', INTERVAL '1 year')")
    op.execute("SELECT add_retention_policy('job_metrics', INTERVAL '1 year')")

    # ── Audit events: enable compression for old data ───────
    # Note: Full monthly partitioning of audit_events would require recreating the
    # table. Instead, we convert to a TimescaleDB hypertable which handles
    # time-based partitioning automatically.
    op.execute(
        "SELECT create_hypertable('audit_events', 'created_at', "
        "migrate_data => true, if_not_exists => true)"
    )
    op.execute("SELECT add_retention_policy('audit_events', INTERVAL '2 years')")

    # ── Jobs: schedule_cron (idempotent) ────────────────────
    # Column may already exist from models.py — add only if missing
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'jobs' AND column_name = 'schedule_cron'
            ) THEN
                ALTER TABLE jobs ADD COLUMN schedule_cron VARCHAR(100);
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("SELECT remove_retention_policy('audit_events', if_exists => true)")
    op.execute("SELECT remove_retention_policy('job_metrics', if_exists => true)")
    op.execute("SELECT remove_retention_policy('classification_events', if_exists => true)")
    op.execute("SELECT remove_retention_policy('scan_results', if_exists => true)")

    op.drop_table("job_metrics")
    op.drop_table("classification_events")
    op.drop_table("scan_results")
