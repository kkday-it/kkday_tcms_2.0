"""external_id unique constraint and version column for optimistic locking

Revision ID: f857c452af6f
Revises: de36f0522dfa
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f857c452af6f'
down_revision: Union[str, Sequence[str], None] = 'de36f0522dfa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. 清理重複的 external_id：保留 id 最小（最舊）的那筆，其餘設為 NULL
    op.execute("""
        UPDATE tcms_test_cases
        SET external_id = NULL
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM tcms_test_cases
            WHERE external_id IS NOT NULL
            GROUP BY external_id
        )
        AND external_id IS NOT NULL
        AND external_id IN (
            SELECT external_id
            FROM tcms_test_cases
            WHERE external_id IS NOT NULL
            GROUP BY external_id
            HAVING COUNT(*) > 1
        )
    """)

    # 1. 移除舊的 non-unique index（會被 unique constraint 取代）
    op.drop_index('ix_tcms_test_cases_external_id', table_name='tcms_test_cases')

    # 2. 加 UNIQUE constraint（允許 NULL，多筆 NULL 共存不違反唯一性）
    op.create_unique_constraint(
        'uq_tcms_test_cases_external_id',
        'tcms_test_cases',
        ['external_id']
    )

    # 3. 加 version 欄位（optimistic locking）
    op.add_column(
        'tcms_test_cases',
        sa.Column('version', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('tcms_test_cases', 'version')
    op.drop_constraint('uq_tcms_test_cases_external_id', 'tcms_test_cases', type_='unique')
    op.create_index('ix_tcms_test_cases_external_id', 'tcms_test_cases', ['external_id'], unique=False)
