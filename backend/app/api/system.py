from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.health import check_schema_health

router = APIRouter()


@router.get("/status")
async def get_system_status():
    is_healthy, missing_tables, missing_columns = await check_schema_health()

    return {
        "database": {
            "healthy": is_healthy,
            "missing_tables": missing_tables,
            "missing_columns": missing_columns,
            "message": "Schema is up to date" if is_healthy else "Database schema is outdated. Manual synchronization required."
        }
    }


@router.get("/diagnose-lost-steps")
async def diagnose_lost_steps(
    include_details: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """One-off diagnostic for the PR #708 / TC-4055 incident.

    Finds TestStep rows that were probably archived in error by the
    `b2c3d4e5f6a7` dedupe migration: their `(test_case_id, "order")` collides
    with a still-Active step in the same case, but their content differs —
    indicating they were a legitimate distinct step that lost its place to
    the partial unique index sweep.

    - `include_details=false` (default): summary by case (case_id, title,
      external_id, lost_step_count, surviving_step_id).
    - `include_details=true`: per-step detail (each archived step's id +
      content snippet) on top of the summary.

    Intended to be removed once data recovery is complete.
    """
    summary_sql = text(
        """
        WITH lost AS (
            SELECT
                archived.test_case_id,
                archived.id          AS archived_id,
                archived."order"     AS archived_order,
                archived.action      AS archived_action,
                kept.id              AS kept_id,
                kept.action          AS kept_action
            FROM tcms_test_steps archived
            JOIN tcms_test_steps kept
              ON archived.test_case_id = kept.test_case_id
             AND archived."order"      = kept."order"
            WHERE archived.status = 'Archived'
              AND kept.status     = 'Active'
              AND archived.id     < kept.id
              AND (archived.action != kept.action
                   OR COALESCE(archived.expected_result, '') != COALESCE(kept.expected_result, ''))
        )
        SELECT
            l.test_case_id,
            c.title,
            c.external_id,
            COUNT(*)               AS lost_step_count,
            1 + COUNT(*)           AS expected_step_count,
            MAX(l.kept_id)         AS surviving_step_id
        FROM lost l
        JOIN tcms_test_cases c ON c.id = l.test_case_id
        GROUP BY l.test_case_id, c.title, c.external_id
        ORDER BY lost_step_count DESC, l.test_case_id
        """
    )
    result = await db.execute(summary_sql)
    summary = [
        {
            "test_case_id": row[0],
            "title": row[1],
            "external_id": row[2],
            "lost_step_count": row[3],
            "expected_step_count": row[4],
            "surviving_step_id": row[5],
        }
        for row in result.all()
    ]

    response = {
        "affected_case_count": len(summary),
        "total_lost_steps": sum(c["lost_step_count"] for c in summary),
        "cases": summary,
    }

    if include_details and summary:
        from sqlalchemy import bindparam

        case_ids = [c["test_case_id"] for c in summary]
        # `expanding=True` lets the same SQL run against PostgreSQL (prod) and
        # SQLite (dev) without dialect-specific ANY()/array syntax.
        detail_sql = text(
            """
            SELECT
                archived.test_case_id,
                archived.id          AS archived_id,
                archived."order"     AS archived_order,
                SUBSTR(archived.action, 1, 120)                          AS archived_action,
                SUBSTR(COALESCE(archived.expected_result, ''), 1, 120)   AS archived_expected,
                kept.id              AS kept_id,
                SUBSTR(kept.action, 1, 120)                              AS kept_action
            FROM tcms_test_steps archived
            JOIN tcms_test_steps kept
              ON archived.test_case_id = kept.test_case_id
             AND archived."order"      = kept."order"
            WHERE archived.status = 'Archived'
              AND kept.status     = 'Active'
              AND archived.id     < kept.id
              AND (archived.action != kept.action
                   OR COALESCE(archived.expected_result, '') != COALESCE(kept.expected_result, ''))
              AND archived.test_case_id IN :case_ids
            ORDER BY archived.test_case_id, archived.id
            """
        ).bindparams(bindparam("case_ids", expanding=True))
        detail_result = await db.execute(detail_sql, {"case_ids": case_ids})
        details_by_case: dict[int, list] = {}
        for row in detail_result.all():
            details_by_case.setdefault(row[0], []).append({
                "archived_id": row[1],
                "archived_order": row[2],
                "archived_action": row[3],
                "archived_expected": row[4],
                "kept_id": row[5],
                "kept_action": row[6],
            })
        for case in response["cases"]:
            case["archived_steps"] = details_by_case.get(case["test_case_id"], [])

    return response
