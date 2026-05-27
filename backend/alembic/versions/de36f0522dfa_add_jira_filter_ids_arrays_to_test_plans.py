"""add jira filter ids arrays to test plans

Revision ID: de36f0522dfa
Revises: c9ed74549000
Create Date: 2026-03-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "de36f0522dfa"
down_revision: Union[str, Sequence[str], None] = "c9ed74549000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    """Add jira_unfix_filter_ids and jira_total_filter_ids JSON array columns.

    Idempotent: skips columns that already exist (some deployed DBs got them via the
    `main.py` startup column-migration hack before this alembic revision landed)."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB
        col_type = JSONB()
    else:
        col_type = sa.JSON()
    for name in ("jira_unfix_filter_ids", "jira_total_filter_ids"):
        if not _has_column(bind, "tcms_test_plans", name):
            op.add_column("tcms_test_plans", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    """Remove jira filter id array columns."""
    bind = op.get_bind()
    for name in ("jira_total_filter_ids", "jira_unfix_filter_ids"):
        if _has_column(bind, "tcms_test_plans", name):
            op.drop_column("tcms_test_plans", name)
