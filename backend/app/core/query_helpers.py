"""Shared SQLAlchemy aggregate expressions.

Small building blocks reused across routers so a single "how do we count X"
definition doesn't drift between endpoints (e.g. the run list and the dashboard
both need the count of Automated cases).
"""
from sqlalchemy import case, func

from app.core.statuses import ARCHIVED, AUTOMATED
from app.models.test_case import TestCase


def automated_count(only_active: bool = False):
    """SUM(CASE WHEN case is Automated THEN 1 ELSE 0) — the number of Automated cases.

    Requires ``TestCase`` to be in the query's FROM/JOIN. With ``only_active=True``
    it also excludes soft-archived cases, matching what the run detail views count
    (see ``get_results_by_run`` / ``get_run``); leave it False for contexts that
    intentionally count every case (e.g. the dashboard's ownership coverage).
    """
    cond = TestCase.automation_status == AUTOMATED
    if only_active:
        cond = cond & (TestCase.status != ARCHIVED)
    return func.sum(case((cond, 1), else_=0))
