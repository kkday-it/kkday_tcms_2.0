import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WEB_SESSION_IDLE_MINUTES
from app.core.config import use_local_db
from app.db.database import engine, get_db
from app.db.health import check_schema_health

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/status")
async def get_system_status():
    is_healthy, missing_tables, missing_columns = await check_schema_health()

    # `render_as_string(hide_password=True)` masks passwords in postgres URLs.
    # For sqlite there's no password — output is the raw path.
    url_redacted = engine.url.render_as_string(hide_password=True)

    return {
        "database": {
            "healthy": is_healthy,
            "missing_tables": missing_tables,
            "missing_columns": missing_columns,
            "message": "Schema is up to date" if is_healthy else "Database schema is outdated. Manual synchronization required."
        },
        "db_mode": {
            "mode": "local" if use_local_db() else "remote",
            "dialect": engine.dialect.name,
            "url_redacted": url_redacted,
        },
        # KQT-15399 review follow-up: expose the authoritative idle window so the
        # frontend IdleLogout can align its countdown with the backend 401 gate
        # instead of relying on a separately-configured VITE_IDLE_TIMEOUT_MINUTES.
        # 0 means the backend idle check is disabled.
        "web_session": {
            "idle_minutes": WEB_SESSION_IDLE_MINUTES,
        },
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


# ──────────────────────────────────────────────────────────────────────────
# Recovery for steps lost to the PR #708 dedupe migration
# ──────────────────────────────────────────────────────────────────────────
#
# Background: pre-PR #706 frontend stripped step.id AND step.order on
# round-trip. Pydantic's TestStepUpdate has `order: int = 1` default, so
# every saved step collapsed onto order=1. PR #708's dedupe migration then
# kept MAX(id) per (case, order) and archived the rest — that's where the
# user's "原本 3 step → 剩 1" data loss comes from.
#
# Strategy: for each affected case, find archived siblings that look like
# they came from the SAME edit batch as the surviving step. Edit batches
# show up as tight clusters in `surviving_id - archived_id` gap space —
# update_case INSERTs N new TestSteps in one go, so their ids are tightly
# consecutive. Older edit cycles sit in a much higher gap range.
#
# Heuristic:
#   1. Sort archived candidates by gap ascending (closest to surviving = newest).
#   2. The "last batch" is a prefix of that list where consecutive gaps differ
#      by ≤ JUMP_THRESHOLD. Stop at the first big jump.
#   3. Bail entirely on the case if even the smallest gap is > MAX_FIRST_GAP —
#      that means the latest batch has no dedupe-victims (e.g. only 1 step
#      survived after a NEW single-step edit; older archived ones are real
#      history we don't want to revive).
#
# Both thresholds are query parameters so PM can tune per inspection.


def _parse_case_id_csv(raw: str | None) -> set[int]:
    """Parse a `1,2,3` comma-separated query param into a set of ints.

    Empty / None → empty set. Tolerates trailing commas and stray whitespace
    so an accidental `4055,` doesn't 500 the request. Non-numeric tokens
    (e.g. `abc`) are dropped but logged at WARNING — silent drops would make
    a fat-fingered query param look like it succeeded, which is the wrong
    failure mode for a one-shot recovery tool.
    """
    if not raw:
        return set()
    out: set[int] = set()
    dropped: list[str] = []
    for tok in raw.split(","):
        tok = tok.strip()
        if not tok:
            continue
        if tok.isdigit():
            out.add(int(tok))
        else:
            dropped.append(tok)
    if dropped:
        logger.warning(
            "_parse_case_id_csv: ignored non-numeric tokens %s from raw=%r",
            dropped, raw,
        )
    return out


def _build_recovery_plan(
    rows: list[tuple[int, int, int, int]],
    jump_threshold: int,
    max_first_gap: int,
    exclude_case_ids: set[int] | None = None,
) -> list[dict]:
    """Group rows by (case_id, surviving_id) and decide which archived siblings
    to restore for each group.

    `rows` shape: (test_case_id, archived_id, surviving_id, surviving_order)

    `exclude_case_ids` lets PM peel off specific cases that have already been
    manually fixed (e.g. TC-4055 was edited by PM after the diagnostic ran,
    so the recovery would over-restore on top of the manual fix).
    """
    excluded = exclude_case_ids or set()
    # Group: { (case_id, surviving_id, surviving_order): [archived_id, …] }
    from collections import defaultdict
    groups: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for case_id, archived_id, surviving_id, surviving_order in rows:
        if case_id in excluded:
            continue
        groups[(case_id, surviving_id, surviving_order)].append(archived_id)

    plan: list[dict] = []
    for (case_id, surviving_id, surviving_order), archived_ids in groups.items():
        # gap ascending = newest first
        gaps_with_ids = sorted(
            ((surviving_id - aid, aid) for aid in archived_ids),
            key=lambda t: t[0],
        )
        gaps = [g for g, _ in gaps_with_ids]
        ids_by_gap = [aid for _, aid in gaps_with_ids]

        if not gaps or gaps[0] > max_first_gap:
            plan.append({
                "test_case_id": case_id,
                "surviving_step_id": surviving_id,
                "action": "skip",
                "reason": (
                    f"min gap {gaps[0]} exceeds max_first_gap={max_first_gap}"
                    if gaps else "no archived candidates"
                ),
                "archived_candidate_count": len(archived_ids),
            })
            continue

        # Walk forward, stop at first jump
        cluster_size = 1
        for i in range(1, len(gaps)):
            if gaps[i] - gaps[i - 1] > jump_threshold:
                break
            cluster_size += 1

        restore_ids = sorted(ids_by_gap[:cluster_size])  # id ascending
        skipped_ids = sorted(ids_by_gap[cluster_size:])

        plan.append({
            "test_case_id": case_id,
            "surviving_step_id": surviving_id,
            "surviving_order": surviving_order,
            "action": "restore",
            # ids in the order they'll be applied (asc). New step orders will
            # be 1..N for these, with surviving_id last at order N+1.
            "restore_archived_ids": restore_ids,
            "new_total_step_count": len(restore_ids) + 1,
            "kept_archived_ids": skipped_ids,
            "kept_archived_reason": (
                "outside jump_threshold cluster" if skipped_ids else None
            ),
        })

    return plan


async def _fetch_recovery_rows(db: AsyncSession):
    sql = text(
        """
        SELECT
            archived.test_case_id,
            archived.id          AS archived_id,
            kept.id              AS surviving_id,
            kept."order"         AS surviving_order
        FROM tcms_test_steps archived
        JOIN tcms_test_steps kept
          ON archived.test_case_id = kept.test_case_id
         AND archived."order"      = kept."order"
        WHERE archived.status = 'Archived'
          AND kept.status     = 'Active'
          AND archived.id     < kept.id
          AND (archived.action != kept.action
               OR COALESCE(archived.expected_result, '') != COALESCE(kept.expected_result, ''))
        """
    )
    result = await db.execute(sql)
    return [(row[0], row[1], row[2], row[3]) for row in result.all()]


@router.get("/recover-lost-steps")
async def preview_lost_steps_recovery(
    jump_threshold: int = 20,
    max_first_gap: int = 100,
    exclude_case_ids: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Dry-run preview of the recovery plan. Always read-only.

    See the comment block above `_build_recovery_plan` for the heuristic.
    Tune `jump_threshold` / `max_first_gap` via query params to see how the
    plan changes before committing to a POST.

    `exclude_case_ids` (CSV, e.g. `4055,4060`) drops specific cases from the
    plan — useful when a case has already been hand-fixed and the recovery
    would over-restore on top of the fix.
    """
    excluded = _parse_case_id_csv(exclude_case_ids)
    rows = await _fetch_recovery_rows(db)
    plan = _build_recovery_plan(
        rows, jump_threshold, max_first_gap, exclude_case_ids=excluded,
    )
    restore_entries = [e for e in plan if e["action"] == "restore"]
    skip_entries = [e for e in plan if e["action"] == "skip"]
    return {
        "dry_run": True,
        "jump_threshold": jump_threshold,
        "max_first_gap": max_first_gap,
        "excluded_case_ids": sorted(excluded),
        "summary": {
            "cases_to_restore": len(restore_entries),
            "cases_to_skip": len(skip_entries),
            "total_steps_to_restore": sum(
                len(e["restore_archived_ids"]) for e in restore_entries
            ),
            "total_archived_to_keep": sum(
                len(e["kept_archived_ids"]) for e in restore_entries
            ) + sum(
                e["archived_candidate_count"] for e in skip_entries
            ),
        },
        "plan": plan,
    }


@router.post("/recover-lost-steps")
async def apply_lost_steps_recovery(
    jump_threshold: int = 20,
    max_first_gap: int = 100,
    exclude_case_ids: str | None = None,
    confirm: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Apply the recovery plan computed by the GET variant.

    Requires `confirm=true` to actually write — guards against typo'd calls.
    Process per case in three phases to dodge the partial unique index from
    PR #708:
      1. Mark every involved row (kept + to-be-restored) `status='Archived'` —
         lifts the (test_case_id, order) WHERE status='Active' constraint.
      2. Re-stamp `order` to 1..N+1 by id ascending.
      3. Flip `status='Active'` on all of them.

    Per-case isolation: each case runs inside its own SAVEPOINT (`begin_nested`)
    so if a phase fails — e.g. rowcount mismatch from a concurrent write — only
    that case's three phases roll back, the other cases stay applied. This is
    a deliberate **partial-success policy**: PM can re-run with the same query
    params to retry just the failed entries after fixing the cause.

    `exclude_case_ids` (CSV, e.g. `4055,4060`) skips specific cases — same
    semantics as the GET variant.
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="recovery is destructive; resend with ?confirm=true to apply",
        )

    excluded = _parse_case_id_csv(exclude_case_ids)
    rows = await _fetch_recovery_rows(db)
    plan = _build_recovery_plan(
        rows, jump_threshold, max_first_gap, exclude_case_ids=excluded,
    )

    restore_entries = [e for e in plan if e["action"] == "restore"]
    applied: list[dict] = []
    failed: list[dict] = []

    for entry in restore_entries:
        case_id = entry["test_case_id"]
        surviving_id = entry["surviving_step_id"]
        all_ids: list[int] = entry["restore_archived_ids"] + [surviving_id]
        expected = len(all_ids)
        try:
            # SAVEPOINT per case so a bad row doesn't corrupt the rest.
            async with db.begin_nested():
                # Phase 1: archive all involved rows.
                r1 = await db.execute(
                    text(
                        "UPDATE tcms_test_steps SET status='Archived' WHERE id IN :ids"
                    ).bindparams(bindparam("ids", expanding=True)),
                    {"ids": all_ids},
                )
                if r1.rowcount != expected:
                    raise RuntimeError(
                        f"phase1 rowcount {r1.rowcount} != expected {expected}"
                    )

                # Phase 2: assign new orders. One UPDATE per id so we don't
                # need DBMS-specific tricks for batch reorder under the
                # partial unique index (status='Archived' makes the index
                # inactive on these rows during this phase anyway, but the
                # serial per-id form is also easier to reason about).
                for new_order, sid in enumerate(all_ids, start=1):
                    r2 = await db.execute(
                        text(
                            "UPDATE tcms_test_steps SET \"order\" = :o WHERE id = :id"
                        ),
                        {"o": new_order, "id": sid},
                    )
                    if r2.rowcount != 1:
                        raise RuntimeError(
                            f"phase2 rowcount {r2.rowcount} != 1 for id={sid}"
                        )

                # Phase 3: bring everyone back as Active.
                r3 = await db.execute(
                    text(
                        "UPDATE tcms_test_steps SET status='Active' WHERE id IN :ids"
                    ).bindparams(bindparam("ids", expanding=True)),
                    {"ids": all_ids},
                )
                if r3.rowcount != expected:
                    raise RuntimeError(
                        f"phase3 rowcount {r3.rowcount} != expected {expected}"
                    )

            applied.append({
                "test_case_id": case_id,
                "surviving_step_id": surviving_id,
                "restored_ids": entry["restore_archived_ids"],
                "new_total_step_count": entry["new_total_step_count"],
                "phase_rowcounts": {"p1": r1.rowcount, "p2_each": 1, "p3": r3.rowcount},
            })
        except Exception as exc:
            # SAVEPOINT auto-rollback on context exit; only THIS case is undone.
            failed.append({
                "test_case_id": case_id,
                "surviving_step_id": surviving_id,
                "error": f"{type(exc).__name__}: {exc}",
            })

    await db.commit()
    return {
        "dry_run": False,
        "jump_threshold": jump_threshold,
        "max_first_gap": max_first_gap,
        "excluded_case_ids": sorted(excluded),
        "applied_count": len(applied),
        "failed_count": len(failed),
        "applied": applied,
        "failed": failed,
    }
