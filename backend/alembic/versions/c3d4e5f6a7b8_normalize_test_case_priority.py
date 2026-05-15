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
    # Build a single UPDATE ... CASE WHEN ... END that does ONE full table
    # scan instead of six. Anything not matched by an alias bucket and not
    # already canonical falls through to "Not Set". The aliases come in
    # via SQL bind parameters (one per bucket) so the migration body is
    # plain SQL strings — no f-string interpolation of values.
    when_clauses: list[str] = []
    bind_params: dict[str, str | list[str]] = {}
    canonical_list: list[str] = []
    for idx, (aliases, canonical) in enumerate(_ALIAS_TO_CANONICAL):
        # SQL doesn't take a list directly; expand to (:p0, :p1, …) per bucket.
        placeholders: list[str] = []
        for j, alias in enumerate(aliases):
            key = f"a{idx}_{j}"
            placeholders.append(f":{key}")
            bind_params[key] = alias
        canonical_key = f"c{idx}"
        bind_params[canonical_key] = canonical
        when_clauses.append(
            f"WHEN LOWER(TRIM(COALESCE(priority, ''))) IN ({', '.join(placeholders)}) THEN :{canonical_key}"
        )
        canonical_list.append(canonical)

    # All currently-canonical values keep themselves — without this branch,
    # rows already at, say, 'Critical' but whose lowercased form happens to
    # be in the "critical" alias bucket would still match, but rows at
    # canonical values not covered by any bucket alias would fall through
    # and become 'Not Set'. Add an explicit pass-through for each canonical.
    canonical_passthrough_keys: list[str] = []
    for idx, canon in enumerate(("Critical", "High", "Medium", "Low", "Not Set")):
        key = f"k{idx}"
        bind_params[key] = canon
        canonical_passthrough_keys.append(f":{key}")
    when_clauses.append(
        f"WHEN priority IN ({', '.join(canonical_passthrough_keys)}) THEN priority"
    )

    sql = f"""
        UPDATE tcms_test_cases
        SET priority = CASE
            {' '.join(when_clauses)}
            ELSE 'Not Set'
        END
    """
    from sqlalchemy import text
    op.execute(text(sql).bindparams(**bind_params))


def downgrade() -> None:
    # Downgrade is a no-op: we can't restore the original legacy strings
    # (they were squashed onto a 5-value set with no journal). Documenting
    # the choice rather than failing silently.
    pass
