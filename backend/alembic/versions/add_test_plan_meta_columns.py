"""Add Test Plan meta columns (prd, sa, sd, timeline, jira)

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-02

Idempotent + dialect-aware. The original revision used `JSONB()` unconditionally, which
breaks SQLite, and added columns without checking for existence, which breaks deployed
DBs where the columns were created out-of-band (e.g. via `Base.metadata.create_all()`
before alembic was introduced). Both issues were fixed in-place — the revision id is
unchanged because no environment has successfully reached a downstream revision *via
this migration*; the columns ended up there through other paths.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b2c3d4e5f6g7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE = "tcms_test_plans"


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def _json_type(bind):
    """JSONB on PostgreSQL, JSON on everything else (SQLite can't compile JSONB)."""
    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB

        return JSONB()
    return sa.JSON()


def _add_if_missing(bind, name: str, type_):
    if not _has_column(bind, _TABLE, name):
        op.add_column(_TABLE, sa.Column(name, type_, nullable=True))


def upgrade() -> None:
    bind = op.get_bind()
    json_t = _json_type(bind)
    _add_if_missing(bind, "prd_url", sa.Text())
    _add_if_missing(bind, "sa_docs", json_t)
    _add_if_missing(bind, "sd_docs", json_t)
    _add_if_missing(bind, "timeline", json_t)
    _add_if_missing(bind, "jira_unfix_filter_id", sa.Integer())
    _add_if_missing(bind, "jira_total_filter_id", sa.Integer())
    _add_if_missing(bind, "jira_display_fields", json_t)


def downgrade() -> None:
    bind = op.get_bind()
    for col in (
        "jira_display_fields",
        "jira_total_filter_id",
        "jira_unfix_filter_id",
        "timeline",
        "sd_docs",
        "sa_docs",
        "prd_url",
    ):
        if _has_column(bind, _TABLE, col):
            op.drop_column(_TABLE, col)
