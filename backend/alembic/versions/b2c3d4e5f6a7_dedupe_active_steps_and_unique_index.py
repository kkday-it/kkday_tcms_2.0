"""dedupe active TestStep rows per (test_case_id, order) and add partial unique index

KQT-15246 hardening follow-up. Prior frontend (TestCaseEditor stripped step.id
on round-trip) + backend (update_case insert-then-archive) interplay could
leave the DB with multiple Active rows for the same (test_case_id, order).
PR #706 fixed the prevention path and added a defensive Python-side dedup in
`get_result_details`. This migration:

  1. Sweeps existing duplicates: for every (test_case_id, order) that has
     more than one Active row, archive all but the row with the largest id
     (preserving the most recently inserted content, which matches what the
     `get_result_details` dedup already shows).
  2. Adds a partial unique index `(test_case_id, "order") WHERE status='Active'`
     so the DB itself refuses to accept new duplicates if a regression slips
     in later.

Revision ID: b2c3d4e5f6a7
Revises: f857c452af6f
Create Date: 2026-05-15 03:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "f857c452af6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # 0. Dedupe existing Active duplicates: keep MAX(id) per (test_case_id, order).
    #    Run BEFORE creating the unique index — otherwise the index creation
    #    would fail on databases that already host duplicates.
    op.execute(
        """
        UPDATE tcms_test_steps
        SET status = 'Archived'
        WHERE status = 'Active'
          AND id NOT IN (
              SELECT MAX(id)
              FROM tcms_test_steps
              WHERE status = 'Active'
              GROUP BY test_case_id, "order"
          )
        """
    )

    # 1. Partial unique index. Same semantics on PostgreSQL and SQLite; alembic
    #    uses the dialect-specific kwarg.
    if dialect == "postgresql":
        op.create_index(
            "uq_tcms_test_steps_active_per_case_order",
            "tcms_test_steps",
            ["test_case_id", "order"],
            unique=True,
            postgresql_where=sa.text("status = 'Active'"),
        )
    elif dialect == "sqlite":
        op.create_index(
            "uq_tcms_test_steps_active_per_case_order",
            "tcms_test_steps",
            ["test_case_id", "order"],
            unique=True,
            sqlite_where=sa.text("status = 'Active'"),
        )
    else:
        # Fallback: skip the partial index on unsupported dialects so the
        # migration still applies. The dedup step above already protects
        # current data; absence of the index just means new regressions
        # wouldn't be DB-blocked.
        pass


def downgrade() -> None:
    # No data-restore step — once duplicates are archived, reviving them
    # would just put the system back into the broken state. Only drop the
    # index here.
    try:
        op.drop_index(
            "uq_tcms_test_steps_active_per_case_order",
            table_name="tcms_test_steps",
        )
    except Exception:
        pass
