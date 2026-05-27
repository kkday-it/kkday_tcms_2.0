"""seed Admin / QA roles for the canonical lists

Revision ID: b7c8d9e0f1a2
Revises: a1b2f3e4d5c6
Create Date: 2026-05-26

Idempotent: only updates rows that already exist with a matching email. Does NOT
create users; missing emails are skipped silently so this migration is safe to
re-run and safe across environments where some users have not signed up yet.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a1b2f3e4d5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ADMIN_EMAILS = (
    "jeremy.hsieh@kkday.com",
    "eden.lai@kkday.com",
    "lance.chien@kkday.com",
    "terry.tsai@kkday.com",
)
QA_EMAILS = (
    "yulia.zhang@kkday.com",
    "eric.su@kkday.com",
    "ethan.chen@kkday.com",
    "ivan.su@kkday.com",
    "lance.liu@kkday.com",
    "angela.lin@kkday.com",
)


def upgrade() -> None:
    bind = op.get_bind()
    users = sa.table(
        "tcms_users",
        sa.column("email", sa.String),
        sa.column("role", sa.String),
    )
    for email in ADMIN_EMAILS:
        bind.execute(users.update().where(users.c.email == email).values(role="Admin"))
    for email in QA_EMAILS:
        bind.execute(users.update().where(users.c.email == email).values(role="QA"))


def downgrade() -> None:
    # Intentionally no-op: we cannot recover the previous role per row, and an empty
    # downgrade keeps `alembic downgrade -1` safe.
    pass
