"""Normalize TestCase.priority to a small canonical set.

TCMS 1.5 inherited cases from several import pipelines (XMind 8 / Zen,
Zephyr Scale XML, manual entry) — each used its own vocabulary for the
priority column. As a result the DB ends up with values like "FAST",
"Highest", "Not Set", or even "Priority 1". The frontend dropdown only
lists Critical/High/Medium/Low, so editing one of these legacy rows would
silently round-trip the unknown value back into the DB.

This module is the single source of truth for the canonical values and the
legacy-alias mapping. Use `normalize_priority()` at every write boundary
(POST / PUT /cases, plus the import paths) so new data is always canonical,
and run the matching Alembic migration once to backfill historical rows.
"""

from typing import Optional

# Canonical priorities, ordered most → least severe. `NOT_SET` is the fallback
# when input is empty/unknown — we never silently default an unknown value to
# a real severity because that would mis-classify cases.
CRITICAL = "Critical"
HIGH = "High"
MEDIUM = "Medium"
LOW = "Low"
NOT_SET = "Not Set"

CANONICAL_PRIORITIES: tuple[str, ...] = (CRITICAL, HIGH, MEDIUM, LOW, NOT_SET)

# Lowercased alias → canonical. Anything not in here (and not already
# canonical) falls through to `NOT_SET` rather than silently surviving
# round-trips.
_ALIASES: dict[str, str] = {
    # already canonical (case-insensitive)
    "critical": CRITICAL,
    "high": HIGH,
    "medium": MEDIUM,
    "low": LOW,
    "not set": NOT_SET,
    "": NOT_SET,
    # XMind 8 / Zen / 2020+ priority markers (also handled by xmind_import.PRIORITY_MAP
    # but kept here so direct DB writes via /cases POST also normalise)
    "priority-1": CRITICAL,
    "priority-2": HIGH,
    "priority-3": MEDIUM,
    "priority-4": LOW,
    # Jira / Zephyr Scale vocabulary
    "highest": CRITICAL,
    "blocker": CRITICAL,
    "urgent": CRITICAL,
    "p0": CRITICAL,
    "important": HIGH,
    "p1": HIGH,
    # KKday-specific legacy tag for "needs quick attention" — empirically used
    # interchangeably with High priority by the QA team.
    "fast": HIGH,
    "normal": MEDIUM,
    "p2": MEDIUM,
    "lowest": LOW,
    "minor": LOW,
    "trivial": LOW,
    "p3": LOW,
    "p4": LOW,
    # KKday Zephyr (KQT project) custom labels
    "rat": CRITICAL,
    "toft": MEDIUM,
    "fet": LOW,
}


def normalize_priority(raw: Optional[str]) -> str:
    """Map an arbitrary priority string to one of CANONICAL_PRIORITIES.

    Unknown input → NOT_SET. The mapping is case- and whitespace-insensitive.
    """
    if raw is None:
        return NOT_SET
    key = raw.strip().lower()
    if not key:
        return NOT_SET
    if key in _ALIASES:
        return _ALIASES[key]
    # Be permissive about input that already matches a canonical value with
    # different casing (e.g. "CRITICAL" / "critical " from a user typing in).
    for canon in CANONICAL_PRIORITIES:
        if key == canon.lower():
            return canon
    return NOT_SET
