"""fix missing ondelete clauses on foreign keys

Revision ID: c8d1e5f29b03
Revises: b3e8f4a21c09
Create Date: 2026-03-24

Aligns migration FK constraints with ORM model declarations:
  - jobs.created_by: add ondelete=CASCADE
  - audit_events.msp_tenant_id: add ondelete=CASCADE
  - audit_events.customer_tenant_id: add ondelete=SET NULL
  - audit_events.job_id: add ondelete=SET NULL
  - audit_events.actor_id: add ondelete=SET NULL
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers
revision: str = "c8d1e5f29b03"
down_revision: str = "b3e8f4a21c09"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _replace_fk(
    table: str,
    column: str,
    ref: str,
    old_name: str,
    new_name: str,
    ondelete: str,
) -> None:
    """Drop old FK and create new one with ondelete."""
    op.drop_constraint(old_name, table, type_="foreignkey")
    op.create_foreign_key(new_name, table, ref.split(".")[0], [column], [ref.split(".")[1]], ondelete=ondelete)


def upgrade() -> None:
    # jobs.created_by → CASCADE
    _replace_fk("jobs", "created_by", "users.id",
                 "jobs_created_by_fkey", "jobs_created_by_fkey", "CASCADE")

    # audit_events.msp_tenant_id → CASCADE
    _replace_fk("audit_events", "msp_tenant_id", "msp_tenants.id",
                 "audit_events_msp_tenant_id_fkey", "audit_events_msp_tenant_id_fkey", "CASCADE")

    # audit_events.customer_tenant_id → SET NULL
    _replace_fk("audit_events", "customer_tenant_id", "customer_tenants.id",
                 "audit_events_customer_tenant_id_fkey", "audit_events_customer_tenant_id_fkey", "SET NULL")

    # audit_events.job_id → SET NULL
    _replace_fk("audit_events", "job_id", "jobs.id",
                 "audit_events_job_id_fkey", "audit_events_job_id_fkey", "SET NULL")

    # audit_events.actor_id → SET NULL
    _replace_fk("audit_events", "actor_id", "users.id",
                 "audit_events_actor_id_fkey", "audit_events_actor_id_fkey", "SET NULL")


def downgrade() -> None:
    # Revert to no ondelete (default RESTRICT/NO ACTION)
    _replace_fk("audit_events", "actor_id", "users.id",
                 "audit_events_actor_id_fkey", "audit_events_actor_id_fkey", "NO ACTION")

    _replace_fk("audit_events", "job_id", "jobs.id",
                 "audit_events_job_id_fkey", "audit_events_job_id_fkey", "NO ACTION")

    _replace_fk("audit_events", "customer_tenant_id", "customer_tenants.id",
                 "audit_events_customer_tenant_id_fkey", "audit_events_customer_tenant_id_fkey", "NO ACTION")

    _replace_fk("audit_events", "msp_tenant_id", "msp_tenants.id",
                 "audit_events_msp_tenant_id_fkey", "audit_events_msp_tenant_id_fkey", "NO ACTION")

    _replace_fk("jobs", "created_by", "users.id",
                 "jobs_created_by_fkey", "jobs_created_by_fkey", "NO ACTION")
