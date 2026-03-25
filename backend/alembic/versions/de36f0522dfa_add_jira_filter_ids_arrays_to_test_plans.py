"""add jira filter ids arrays to test plans

Revision ID: de36f0522dfa
Revises: c9ed74549000
Create Date: 2026-03-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "de36f0522dfa"
down_revision: Union[str, Sequence[str], None] = "c9ed74549000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add jira_unfix_filter_ids and jira_total_filter_ids JSON array columns."""
    op.add_column("tcms_test_plans", sa.Column("jira_unfix_filter_ids", JSONB(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("jira_total_filter_ids", JSONB(), nullable=True))


def downgrade() -> None:
    """Remove jira filter id array columns."""
    op.drop_column("tcms_test_plans", "jira_total_filter_ids")
    op.drop_column("tcms_test_plans", "jira_unfix_filter_ids")
