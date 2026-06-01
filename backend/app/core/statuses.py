"""Status string constants for the soft-archive pattern.

Every test_* entity (cases, runs, plans, run-folders, suites, steps) stores its
lifecycle as a `status` string column with the same two canonical values; the
pattern is used as a soft-delete (e.g. delete_case sets `status="Archived"`,
list endpoints filter `status != "Archived"`). Centralising the literals here
avoids a silent bug where a typo in any one router fails to filter without
raising an error.

Use with SQLAlchemy filters:
    .where(TestCase.status != ARCHIVED)
    case.status = ARCHIVED
"""
from typing import Final

ACTIVE: Final[str] = "Active"
ARCHIVED: Final[str] = "Archived"
