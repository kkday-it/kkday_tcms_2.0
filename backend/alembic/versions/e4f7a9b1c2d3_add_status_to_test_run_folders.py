"""KQT-15346: add status to tcms_test_run_folders for soft archive

Revision ID: e4f7a9b1c2d3
Revises: c3d4e5f6a7b8
Create Date: 2026-05-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e4f7a9b1c2d3"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add `status` column so folder soft-archive matches the existing pattern used by
    tcms_test_runs / tcms_test_plans / tcms_test_cases.
    """
    op.add_column(
        "tcms_test_run_folders",
        sa.Column("status", sa.String(), nullable=False, server_default="Active"),
    )


def downgrade() -> None:
    op.drop_column("tcms_test_run_folders", "status")
