"""Add jira chart config to test plans

Revision ID: 79bddd38a235
Revises: b2c3d4e5f6g7
Create Date: 2026-03-06 09:57:34.411674

NOTE: A parallel revision `1a7689ec7f18` adds the same two columns. Both share
`b2c3d4e5f6g7` as `down_revision` and were merged by `c9ed74549000_merge_heads`, so on a
forward `upgrade head` both run in sequence. Without the existence guard below the
second one would always raise DuplicateColumn. Kept as separate revisions (rather than
deleting one) so any DB stamped at one but not the other still has a valid path.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "79bddd38a235"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE = "tcms_test_plans"


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, _TABLE, "jira_chart_filter_id"):
        op.add_column(_TABLE, sa.Column("jira_chart_filter_id", sa.Integer(), nullable=True))
    if not _has_column(bind, _TABLE, "jira_chart_field"):
        op.add_column(_TABLE, sa.Column("jira_chart_field", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, _TABLE, "jira_chart_field"):
        op.drop_column(_TABLE, "jira_chart_field")
    if _has_column(bind, _TABLE, "jira_chart_filter_id"):
        op.drop_column(_TABLE, "jira_chart_filter_id")
