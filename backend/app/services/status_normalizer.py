"""Normalize TestCase.status to the canonical lifecycle set.

`status` is the load-bearing lifecycle column for a test case AND doubles as
the soft-delete sentinel ("Archived"; see app.core.statuses). Historically the
column also carried "Active" (the pre-canonical in-use state) alongside Draft /
Approved. The TCMS case-management principle keeps three *selectable* lifecycle
values — Draft / Approved / Deprecated — and folds the legacy "Active" into
Draft. Mirrors services/priority_normalizer.py: apply `normalize_status()` at
every editor/import write boundary so new data is always canonical, and edits
silently round legacy rows forward (no bulk backfill required).

"Archived" is intentionally NOT a canonical lifecycle value and NOT an alias
target — it is reached only via the delete endpoint. `normalize_status()`
returns ARCHIVED unchanged when handed it, so the caller can detect and refuse
it explicitly (the editor must never soft-delete a case by setting its status)
rather than the normalizer silently resurrecting or deleting a row.
"""
from typing import Optional

from app.core.statuses import ARCHIVED

DRAFT = "Draft"
APPROVED = "Approved"
DEPRECATED = "Deprecated"

# User-selectable lifecycle values, ordered new → retired.
CANONICAL_STATUSES: tuple[str, ...] = (DRAFT, APPROVED, DEPRECATED)

# Lowercased alias → canonical. Unknown/empty falls through to DRAFT (the safe
# entry state), never to a more-committed value like Approved.
_ALIASES: dict[str, str] = {
    "draft": DRAFT,
    "approved": APPROVED,
    "deprecated": DEPRECATED,
    "": DRAFT,
    # Legacy in-use state. Folded into Draft per the TCMS case-management
    # principle (2026-06 decision); editing any legacy "Active" row rewrites it.
    "active": DRAFT,
}


def normalize_status(raw: Optional[str]) -> str:
    """Map an arbitrary status string to a canonical lifecycle value.

    Unknown/empty input → DRAFT. The "Archived" soft-delete sentinel is
    returned unchanged so the caller can reject it explicitly. Case- and
    whitespace-insensitive.
    """
    if raw is None:
        return DRAFT
    key = raw.strip().lower()
    if not key:
        return DRAFT
    if key == ARCHIVED.lower():
        return ARCHIVED
    if key in _ALIASES:
        return _ALIASES[key]
    for canon in CANONICAL_STATUSES:
        if key == canon.lower():
            return canon
    return DRAFT
