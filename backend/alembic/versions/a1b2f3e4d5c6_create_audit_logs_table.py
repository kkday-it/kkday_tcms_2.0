"""create tcms_audit_logs table

Revision ID: a1b2f3e4d5c6
Revises: f8a9b0c1d2e3
Create Date: 2026-05-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a1b2f3e4d5c6"
down_revision: Union[str, Sequence[str], None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tcms_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        # actor_id is nullable so anonymous / system actions can still log (won't happen
        # in normal usage, but avoids losing the audit row if user is somehow detached).
        sa.Column(
            "actor_id",
            sa.Integer(),
            sa.ForeignKey("tcms_users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("actor_role", sa.String(length=32), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False, index=True),
        sa.Column("resource_type", sa.String(length=64), nullable=False, index=True),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_audit_logs_created_at",
        "tcms_audit_logs",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="tcms_audit_logs")
    op.drop_table("tcms_audit_logs")
