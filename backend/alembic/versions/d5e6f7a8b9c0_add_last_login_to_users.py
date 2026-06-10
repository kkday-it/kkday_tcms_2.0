"""add last_login to tcms_users

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f60718
Create Date: 2026-06-10

Adds a nullable `last_login` timestamp to tcms_users, written on every
successful login (password + Google SSO). Nullable with no default, so
existing rows stay NULL ("never logged in since this shipped") rather than
being back-filled with a misleading timestamp.

Idempotent: the column add is skipped if it already exists, so re-running on
an environment that was hand-patched is safe.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f60718"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "tcms_users"
COLUMN = "last_login"


def _columns(table: str) -> set[str] | None:
    """Return existing column names, or None when running offline (no live bind)."""
    from alembic import context
    if context.is_offline_mode():
        return None
    bind = op.get_bind()
    return {col["name"] for col in inspect(bind).get_columns(table)}


def upgrade() -> None:
    cols = _columns(TABLE)
    if cols is not None and COLUMN in cols:
        return
    op.add_column(TABLE, sa.Column(COLUMN, sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    cols = _columns(TABLE)
    if cols is not None and COLUMN not in cols:
        return
    op.drop_column(TABLE, COLUMN)
