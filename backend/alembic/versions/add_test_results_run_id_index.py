"""add index on tcms_test_results.run_id

Revision ID: a1b2c3d4e5f6
Revises: 8544e6486b06
Create Date: 2026-03-02

"""
from typing import Sequence, Union

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "8544e6486b06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_tcms_test_results_run_id"),
        "tcms_test_results",
        ["run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_tcms_test_results_run_id"),
        table_name="tcms_test_results",
    )
