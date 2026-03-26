"""Add CHECK constraints for role and status enum columns.

Revision ID: d9f3a7b84c12
Revises: c8d1e5f29b03
Create Date: 2026-03-25
"""

from alembic import op

# revision identifiers
revision = "d9f3a7b84c12"
down_revision = "c8d1e5f29b03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_user_role",
        "users",
        "role IN ('Admin', 'Operator', 'Viewer')",
    )
    op.create_check_constraint(
        "ck_tenant_consent_status",
        "customer_tenants",
        "consent_status IN ('pending', 'active', 'consent_denied', 'revoked')",
    )
    op.create_check_constraint(
        "ck_job_status",
        "jobs",
        "status IN ('pending', 'enumerating', 'running', 'paused', 'completed', 'failed', 'rolling_back', 'rolled_back')",
    )
    op.create_check_constraint(
        "ck_checkpoint_type",
        "job_checkpoints",
        "checkpoint_type IN ('enumeration', 'labelling', 'rollback')",
    )
    op.create_check_constraint(
        "ck_checkpoint_status",
        "job_checkpoints",
        "status IN ('completed', 'failed')",
    )
    op.create_check_constraint(
        "ck_scan_outcome",
        "scan_results",
        "outcome IN ('labelled', 'skipped', 'failed', 'deferred')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_scan_outcome", "scan_results", type_="check")
    op.drop_constraint("ck_checkpoint_status", "job_checkpoints", type_="check")
    op.drop_constraint("ck_checkpoint_type", "job_checkpoints", type_="check")
    op.drop_constraint("ck_job_status", "jobs", type_="check")
    op.drop_constraint("ck_tenant_consent_status", "customer_tenants", type_="check")
    op.drop_constraint("ck_user_role", "users", type_="check")
