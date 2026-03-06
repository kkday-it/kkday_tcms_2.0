"""Add jira chart config to test plans

Revision ID: 79bddd38a235
Revises: b2c3d4e5f6g7
Create Date: 2026-03-06 09:57:34.411674

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79bddd38a235'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tcms_test_plans', sa.Column('jira_chart_filter_id', sa.Integer(), nullable=True))
    op.add_column('tcms_test_plans', sa.Column('jira_chart_field', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('tcms_test_plans', 'jira_chart_field')
    op.drop_column('tcms_test_plans', 'jira_chart_filter_id')
