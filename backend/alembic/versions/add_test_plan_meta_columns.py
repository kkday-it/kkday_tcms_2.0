"""Add Test Plan meta columns (prd, sa, sd, timeline, jira)

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "b2c3d4e5f6g7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tcms_test_plans", sa.Column("prd_url", sa.Text(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("sa_docs", JSONB(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("sd_docs", JSONB(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("timeline", JSONB(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("jira_unfix_filter_id", sa.Integer(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("jira_total_filter_id", sa.Integer(), nullable=True))
    op.add_column("tcms_test_plans", sa.Column("jira_display_fields", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("tcms_test_plans", "jira_display_fields")
    op.drop_column("tcms_test_plans", "jira_total_filter_id")
    op.drop_column("tcms_test_plans", "jira_unfix_filter_id")
    op.drop_column("tcms_test_plans", "timeline")
    op.drop_column("tcms_test_plans", "sd_docs")
    op.drop_column("tcms_test_plans", "sa_docs")
    op.drop_column("tcms_test_plans", "prd_url")
