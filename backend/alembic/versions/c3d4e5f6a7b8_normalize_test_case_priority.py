"""normalize legacy TestCase.priority values onto Critical/High/Medium/Low/Not Set

Backfill counterpart to the runtime normaliser in
`app/services/priority_normalizer.py`. TCMS 1.5 inherited a long tail of
priority strings from Zephyr / XMind / manual entry — "FAST", "Highest",
"Normal", "Priority 1", "P0", etc. Once the runtime normaliser is in place
new writes are canonical, but existing rows keep their legacy values and
the frontend dropdown can't render them, so editing one silently breaks
(the form select shows nothing selected — user reported this on TC-4055
with priority="FAST").

This migration rewrites every legacy value to its canonical equivalent.
Unknown / unmappable strings collapse to "Not Set" rather than guessing.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-15 07:30:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Keep this list aligned with app.services.priority_normalizer._ALIASES.
# Sorted from most → least severe so that an alias like "fast" (mapped to
# High) doesn't accidentally collide with substring matches — we use exact
# LOWER() equality, not LIKE.
_ALIAS_TO_CANONICAL: list[tuple[list[str], str]] = [
    (["critical", "highest", "blocker", "urgent", "p0", "priority-1"], "Critical"),
    (["high", "important", "p1", "fast", "priority-2"], "High"),
    (["medium", "normal", "p2", "priority-3"], "Medium"),
    (["low", "lowest", "minor", "trivial", "p3", "p4", "priority-4"], "Low"),
    (["not set", ""], "Not Set"),
]


def upgrade() -> None:
    # 1. Apply each alias bucket. LOWER() + TRIM() so we catch any casing /
    #    whitespace variant. Use a NOT IN guard so the migration is idempotent
    #    and we don't keep rewriting already-canonical rows (e.g. on re-run).
    for aliases, canonical in _ALIAS_TO_CANONICAL:
        # quote each alias for SQL
        quoted = ", ".join(f"'{a}'" for a in aliases)
        op.execute(
            f"""
            UPDATE tcms_test_cases
            SET priority = '{canonical}'
            WHERE LOWER(TRIM(COALESCE(priority, ''))) IN ({quoted})
              AND priority IS DISTINCT FROM '{canonical}'
            """ if op.get_bind().dialect.name == "postgresql" else
            f"""
            UPDATE tcms_test_cases
            SET priority = '{canonical}'
            WHERE LOWER(TRIM(COALESCE(priority, ''))) IN ({quoted})
              AND (priority IS NULL OR priority != '{canonical}')
            """
        )

    # 2. Anything not matched above — i.e. an unknown legacy tag we didn't
    #    list — collapses to "Not Set". We catch by elimination: any row
    #    whose priority isn't already canonical.
    op.execute(
        """
        UPDATE tcms_test_cases
        SET priority = 'Not Set'
        WHERE priority NOT IN ('Critical', 'High', 'Medium', 'Low', 'Not Set')
           OR priority IS NULL
        """
    )


def downgrade() -> None:
    # Downgrade is a no-op: we can't restore the original legacy strings
    # (they were squashed onto a 5-value set with no journal). Documenting
    # the choice rather than failing silently.
    pass
