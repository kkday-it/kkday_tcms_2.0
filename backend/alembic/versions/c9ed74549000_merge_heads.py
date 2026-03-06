"""merge heads

Revision ID: c9ed74549000
Revises: 1a7689ec7f18, 79bddd38a235
Create Date: 2026-03-06 09:58:23.129777

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9ed74549000'
down_revision: Union[str, Sequence[str], None] = ('1a7689ec7f18', '79bddd38a235')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
