"""Add missing columns

Revision ID: 43b3c73328ee
Revises: 0001_initial_schema
Create Date: 2026-03-01 01:55:32.107542

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "43b3c73328ee"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — idempotent: skip if column already exists."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    run_columns = [c["name"] for c in inspector.get_columns("test_runs")]
    if "assignee_id" not in run_columns:
        op.add_column("test_runs", sa.Column("assignee_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    run_columns = [c["name"] for c in inspector.get_columns("test_runs")]
    if "assignee_id" in run_columns:
        op.drop_column("test_runs", "assignee_id")
