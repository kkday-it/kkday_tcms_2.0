"""add status indexes on test_* tables

Revision ID: c3d4e5f60718
Revises: b7c8d9e0f1a2
Create Date: 2026-05-28

The four test_* tables (cases, runs, plans, run_folders) are now filtered on
`status != "Archived"` in every list endpoint after the soft-archive rollout.
At 300 TCMS users (planned), full-table scans on those filters become the
hot path; a single-column index keeps the steady state cheap.

Idempotent: each `op.create_index` is wrapped to skip if the index already
exists, so re-running on an environment that was hand-indexed is safe.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


revision: str = "c3d4e5f60718"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table_name, index_name) — column is always `status`.
INDEXES = [
    ("tcms_test_cases", "ix_tcms_test_cases_status"),
    ("tcms_test_runs", "ix_tcms_test_runs_status"),
    ("tcms_test_plans", "ix_tcms_test_plans_status"),
    ("tcms_test_run_folders", "ix_tcms_test_run_folders_status"),
]


def _existing_index_names(table: str) -> set[str] | None:
    """Return existing index names, or None when running offline (no live bind)."""
    from alembic import context
    if context.is_offline_mode():
        return None
    bind = op.get_bind()
    inspector = inspect(bind)
    return {idx["name"] for idx in inspector.get_indexes(table)}


def upgrade() -> None:
    for table, ix_name in INDEXES:
        existing = _existing_index_names(table)
        if existing is not None and ix_name in existing:
            continue
        op.create_index(ix_name, table, ["status"])


def downgrade() -> None:
    for table, ix_name in INDEXES:
        existing = _existing_index_names(table)
        if existing is not None and ix_name not in existing:
            continue
        op.drop_index(ix_name, table_name=table)
