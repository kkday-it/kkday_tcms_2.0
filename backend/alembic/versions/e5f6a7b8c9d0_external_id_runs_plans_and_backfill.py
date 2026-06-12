"""external_id for runs/plans (KQT-R / KQT-P) + backfill all entities

Revision ID: e5f6a7b8c9d0
Revises: d5e6f7a8b9c0
Create Date: 2026-06-12

Rolls out human-facing external IDs across all three entities:

* tcms_test_cases — already has the column; XMind-imported rows were never
  assigned one (only single create_case + Zephyr import were), so suites such
  as suite 199 show only TC-{id}. Backfill every NULL/'' row to KQT-T{50000+id}
  (the +50000 offset avoids colliding with Zephyr Scale's own KQT-T keys).
* tcms_test_runs — new nullable+unique column, backfilled to KQT-R{id}.
* tcms_test_plans — new nullable+unique column, backfilled to KQT-P{id}.

Runs/plans use the raw id (no offset): TCMS itself is their only producer, so
there is no external namespace to collide with, and it matches the "KQT-R{id}"
the frontend has already been surfacing.

Idempotent: column adds / index creates are skipped when already present, and
the backfill only touches NULL/'' rows, so re-running is safe.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    """Return a live inspector, or None when running offline (no bind)."""
    from alembic import context
    if context.is_offline_mode():
        return None
    return inspect(op.get_bind())


def _has_column(insp, table: str, column: str) -> bool:
    return insp is not None and column in {c["name"] for c in insp.get_columns(table)}


def _has_index(insp, table: str, index: str) -> bool:
    return insp is not None and index in {ix["name"] for ix in insp.get_indexes(table)}


def _add_external_id(insp, table: str) -> None:
    if not _has_column(insp, table, "external_id"):
        op.add_column(table, sa.Column("external_id", sa.String(), nullable=True))


def _backfill(table: str, prefix: str, offset: int) -> None:
    # `text || integer` works on both PostgreSQL (implicit cast) and SQLite.
    op.execute(
        f"UPDATE {table} SET external_id = '{prefix}' || ({offset} + id) "
        f"WHERE external_id IS NULL OR external_id = ''"
    )


def _create_unique_index(insp, table: str, index_name: str) -> None:
    if not _has_index(insp, table, index_name):
        op.create_index(index_name, table, ["external_id"], unique=True)


def upgrade() -> None:
    insp = _inspector()

    # 1. Cases: column already exists; just backfill the rows missing one.
    _backfill("tcms_test_cases", "KQT-T", 50000)

    # 2. Runs: add column, backfill, then enforce uniqueness.
    _add_external_id(insp, "tcms_test_runs")
    _backfill("tcms_test_runs", "KQT-R", 0)
    insp = _inspector()  # refresh after add_column
    _create_unique_index(insp, "tcms_test_runs", "uq_tcms_test_runs_external_id")

    # 3. Plans: add column, backfill, then enforce uniqueness.
    _add_external_id(insp, "tcms_test_plans")
    _backfill("tcms_test_plans", "KQT-P", 0)
    insp = _inspector()
    _create_unique_index(insp, "tcms_test_plans", "uq_tcms_test_plans_external_id")


def downgrade() -> None:
    insp = _inspector()
    if _has_index(insp, "tcms_test_plans", "uq_tcms_test_plans_external_id"):
        op.drop_index("uq_tcms_test_plans_external_id", table_name="tcms_test_plans")
    if _has_column(insp, "tcms_test_plans", "external_id"):
        op.drop_column("tcms_test_plans", "external_id")
    if _has_index(insp, "tcms_test_runs", "uq_tcms_test_runs_external_id"):
        op.drop_index("uq_tcms_test_runs_external_id", table_name="tcms_test_runs")
    if _has_column(insp, "tcms_test_runs", "external_id"):
        op.drop_column("tcms_test_runs", "external_id")
    # Case external_ids are left in place: they are the canonical identifier and
    # predate this migration; clearing them would break existing references.
