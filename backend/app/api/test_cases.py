import csv
import io
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, with_loader_criteria

from app.api.deps import record_audit, require_role
from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_case_history import TestCaseHistory
from app.models.test_step import TestStep
from app.models.test_suite import TestSuite
from app.models.user import User
from app.schemas.test_case import TestCaseCreate, TestCaseResponse, TestCaseUpdate, TestCaseBatchDelete, TestCaseBatchMove, TestCaseBatchClone
from app.schemas.test_case_history import TestCaseHistoryResponse
from app.services.dify_sync import build_case_metadata, build_case_text
from app.services.priority_normalizer import normalize_priority
from app.services.status_normalizer import normalize_status, DRAFT
from app.core.statuses import ARCHIVED

logger = logging.getLogger(__name__)

router = APIRouter()

# external_id 格式：KQT-T{EXTERNAL_ID_OFFSET + case.id}
# offset 50000 確保與 Zephyr Scale 現有編號（上限約 38000）不重疊
EXTERNAL_ID_PREFIX = "KQT-T"
EXTERNAL_ID_OFFSET = 50000

@router.get("/labels/all", response_model=List[str])
async def get_all_labels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestCase.labels).where(TestCase.labels.is_not(None)))
    
    unique_labels = set()
    for row in result.all():
        labels_json = row[0]
        if labels_json:
            try:
                import json
                labels = json.loads(labels_json)
                if isinstance(labels, list):
                    unique_labels.update([str(l).strip() for l in labels])
            except Exception:
                # Fallback to comma separation
                labels = [l.strip() for l in labels_json.split(',')]
                unique_labels.update(labels)
                
    return sorted(list(unique_labels))

@router.get("/project/{project_id}", response_model=List[TestCaseResponse])
async def list_cases_by_project(
    project_id: int, 
    exclude_tags: Optional[str] = None,
    exclude_labels: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(TestCase)
        .join(TestSuite)
        .options(selectinload(TestCase.steps))
        .where(TestSuite.project_id == project_id)
    )

    if exclude_tags:
        exclude_tags_list = [t.strip().lower() for t in exclude_tags.split(',')]
        for tag in exclude_tags_list:
            query = query.where((TestCase.tags.is_(None)) | (~TestCase.tags.ilike(f"%{tag}%")))

    if exclude_labels:
        exclude_labels_list = [l.strip().lower() for l in exclude_labels.split(',')]
        for label in exclude_labels_list:
            query = query.where((TestCase.labels.is_(None)) | (~TestCase.labels.ilike(f"%{label}%")))
    query = query.where(TestCase.status != ARCHIVED)
    query = query.options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
    # Stable creation-order: xmind/zephyr import inserts cases depth-first
    # following the source tree, so ordering by id preserves the mindmap order.
    query = query.order_by(TestCase.id)

    result = await db.execute(query)
    return result.scalars().all()

@router.get("/suite/{suite_id}", response_model=List[TestCaseResponse])
async def list_cases_by_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    # Recursive CTE to find the suite and all its descendant suites
    hierarchy = (
        select(TestSuite.id)
        .where(TestSuite.id == suite_id)
        .cte(name="suite_hierarchy", recursive=True)
    )

    hierarchy = hierarchy.union_all(
        select(TestSuite.id)
        .where(TestSuite.parent_suite_id == hierarchy.c.id)
    )

    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
        .where(TestCase.suite_id.in_(select(hierarchy.c.id)))
        .where(TestCase.status != ARCHIVED)
        .order_by(TestCase.id)
    )
    return result.scalars().all()

@router.post("/", response_model=TestCaseResponse)
async def create_case(case_in: TestCaseCreate, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    provided_ext_id = case_in.external_id and case_in.external_id.strip()

    case_data = case_in.model_dump(exclude={"steps"})
    # KQT TCMS hardening: collapse legacy priority vocab (FAST / Highest /
    # Normal / Priority-N …) onto the canonical Critical/High/Medium/Low set
    # at the write boundary, so the dropdown never sees a value it can't render.
    if "priority" in case_data:
        case_data["priority"] = normalize_priority(case_data.get("priority"))
    # Same hardening for status: fold legacy "Active" into the canonical
    # Draft/Approved/Deprecated lifecycle. The editor must not reach the
    # Archived soft-delete sentinel through this path — refuse it explicitly.
    if "status" in case_data:
        normalized_status = normalize_status(case_data.get("status"))
        if normalized_status == ARCHIVED:
            raise HTTPException(
                status_code=400,
                detail="不可將 status 設為 Archived；刪除請走刪除 API",
            )
        case_data["status"] = normalized_status
    case = TestCase(**case_data)

    try:
        db.add(case)
        await db.flush()  # get case.id
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"external_id '{provided_ext_id}' 已存在，請使用不同的 ID",
        )

    if not (case.external_id and case.external_id.strip()):
        case.external_id = f"{EXTERNAL_ID_PREFIX}{EXTERNAL_ID_OFFSET + case.id}"

    for step_in in case_in.steps:
        step = TestStep(**step_in.model_dump(), test_case_id=case.id)
        db.add(step)

    # Create History Record (Created)
    history = TestCaseHistory(
        case_id=case.id,
        user_id=1,  # Hardcoded User 1 for now until auth is fully integrated
        action="Created",
        changed_fields=json.dumps({"title": case.title})
    )
    db.add(history)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"external_id '{case.external_id}' 已存在，請使用不同的 ID",
        )

    await db.refresh(case)

    # Reload with steps
    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
        .where(TestCase.id == case.id)
    )
    return result.scalar_one()

@router.get("/export")
async def export_cases(
    project_id: int = Query(..., description="Project ID"),
    suite_id: Optional[int] = Query(None, description="限定 Suite（含子 Suite），不填則匯出整個 Project"),
    format: str = Query("csv", description="匯出格式：csv | json | ai_json"),
    db: AsyncSession = Depends(get_db),
):
    """
    匯出 Test Cases。

    - **csv** — 適合 Excel 開啟的試算表
    - **json** — 完整結構化資料，適合系統整合
    - **ai_json** — 適合向量資料庫 ingestion（含 text + metadata 欄位）
    """
    if suite_id:
        hierarchy = (
            select(TestSuite.id)
            .where(TestSuite.id == suite_id)
            .cte(name="suite_hierarchy", recursive=True)
        )
        hierarchy = hierarchy.union_all(
            select(TestSuite.id).where(TestSuite.parent_suite_id == hierarchy.c.id)
        )
        result = await db.execute(
            select(TestCase)
            .options(selectinload(TestCase.steps))
            .where(TestCase.suite_id.in_(select(hierarchy.c.id)))
            # Don't export soft-deleted cases (mirrors the list endpoints).
            .where(TestCase.status != ARCHIVED)
        )
    else:
        result = await db.execute(
            select(TestCase)
            .join(TestSuite)
            .options(selectinload(TestCase.steps))
            .where(TestSuite.project_id == project_id)
            .where(TestCase.status != ARCHIVED)
        )
    cases = result.scalars().all()

    if format == "csv":
        output = io.StringIO()
        max_steps = max((len(c.steps) for c in cases), default=0)
        step_headers = []
        for i in range(1, max_steps + 1):
            step_headers += [f"step_{i}_action", f"step_{i}_data", f"step_{i}_expected"]

        writer = csv.DictWriter(output, fieldnames=[
            "case_id", "suite_id", "title", "lifecycle_status", "priority",
            "automation_status", "layer", "type", "severity",
            "tags", "labels", "jira_keys", "external_id",
            "preconditions", "postconditions", *step_headers,
        ])
        writer.writeheader()
        for case in cases:
            row = {
                "case_id": f"TC-{case.id}",
                "suite_id": case.suite_id,
                "title": case.title,
                # Lifecycle now lives on `status` (the lifecycle_status column is
                # dead); keep the export key for downstream compat but source the
                # live value so exports don't freeze at the stale default.
                "lifecycle_status": case.status,
                "priority": case.priority,
                "automation_status": case.automation_status,
                "layer": case.layer or "",
                "type": case.type or "",
                "severity": case.severity,
                "tags": case.tags or "",
                "labels": case.labels or "",
                "jira_keys": case.jira_keys or "",
                "external_id": case.external_id or "",
                "preconditions": case.preconditions or "",
                "postconditions": case.postconditions or "",
            }
            for i, step in enumerate(case.steps, 1):
                row[f"step_{i}_action"] = step.action
                row[f"step_{i}_data"] = step.data or ""
                row[f"step_{i}_expected"] = step.expected_result or ""
            writer.writerow(row)

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": "attachment; filename=test_cases.csv"},
        )

    elif format == "json":
        data = []
        for case in cases:
            data.append({
                "id": f"TC-{case.id}",
                "suite_id": case.suite_id,
                "title": case.title,
                # Lifecycle now lives on `status` (the lifecycle_status column is
                # dead); keep the export key for downstream compat but source the
                # live value so exports don't freeze at the stale default.
                "lifecycle_status": case.status,
                "priority": case.priority,
                "automation_status": case.automation_status,
                "layer": case.layer,
                "type": case.type,
                "severity": case.severity,
                "tags": json.loads(case.tags) if case.tags else [],
                "labels": json.loads(case.labels) if case.labels else [],
                "jira_keys": case.jira_keys,
                "external_id": case.external_id,
                "preconditions": case.preconditions,
                "postconditions": case.postconditions,
                "steps": [
                    {"order": s.order, "action": s.action, "data": s.data, "expected": s.expected_result}
                    for s in case.steps
                ],
            })
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=test_cases.json"},
        )

    elif format == "ai_json":
        data = []
        for case in cases:
            data.append({
                "id": f"TC-{case.id}",
                "text": build_case_text(case),
                "metadata": build_case_metadata(case),
            })
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=test_cases_ai.json"},
        )

    else:
        raise HTTPException(status_code=400, detail=f"不支援的格式：{format}。請使用 csv | json | ai_json")


# NOTE: Batch endpoints (/batch, /batch-move) MUST be declared before the
# /{case_id} routes — FastAPI matches in declaration order, and the int-typed
# {case_id} path otherwise swallows literal segments like "batch-move",
# producing a 422 with "value is not a valid integer" (see KQT-15197).

@router.delete("/batch")
async def batch_delete_cases(
    request: Request,
    payload: TestCaseBatchDelete,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    if not payload.case_ids:
        return {"message": "No test cases provided"}

    result = await db.execute(select(TestCase).where(TestCase.id.in_(payload.case_ids)))
    cases = result.scalars().all()

    if not cases:
        raise HTTPException(status_code=404, detail="No matching TestCases found")

    for case in cases:
        case.status = ARCHIVED
        history = TestCaseHistory(
            case_id=case.id,
            user_id=1,
            action="Archived",
            changed_fields=json.dumps({"status": "Active -> Archived"}, ensure_ascii=False)
        )
        db.add(history)

    await db.commit()
    await record_audit(
        db, request, actor,
        action="delete_case_batch",
        resource_type="test_case",
        resource_id=None,
        metadata={"case_ids": payload.case_ids},
    )
    return {"message": f"Successfully archived {len(cases)} TestCases"}


@router.put("/batch-move")
async def batch_move_cases(payload: TestCaseBatchMove, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    if not payload.case_ids:
        return {"message": "No test cases provided"}

    suite = await db.get(TestSuite, payload.suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Target folder (TestSuite) not found")

    result = await db.execute(select(TestCase).where(TestCase.id.in_(payload.case_ids)))
    cases = result.scalars().all()

    if not cases:
        raise HTTPException(status_code=404, detail="No matching TestCases found")

    for case in cases:
        if case.suite_id != payload.suite_id:
            history = TestCaseHistory(
                case_id=case.id,
                user_id=1,
                action="Moved",
                changed_fields=json.dumps({"suite_id": f"{case.suite_id} -> {payload.suite_id}"}, ensure_ascii=False)
            )
            db.add(history)
            case.suite_id = payload.suite_id

    await db.commit()
    return {"message": f"Successfully moved {len(cases)} TestCases to folder {payload.suite_id}"}


# Fields copied verbatim when cloning. Excludes id/created_at/updated_at (auto),
# external_id (unique — re-generated below) and version (reset to 0 on the copy).
_CLONE_FIELDS = (
    "suite_id", "status", "lifecycle_status", "description", "severity",
    "priority", "type", "layer", "behavior", "automation_status",
    "is_flaky", "muted", "preconditions", "postconditions",
    "default_owner_id", "tags", "labels", "jira_keys",
)


@router.post("/batch-clone", response_model=List[TestCaseResponse])
async def batch_clone_cases(
    request: Request,
    payload: TestCaseBatchClone,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    """KQT-15586: duplicate selected cases (incl. their steps) into the same
    folder, Zephyr-style. Each copy gets a "(Copy)" title suffix and a fresh
    auto-generated external_id; version resets to 0."""
    if not payload.case_ids:
        return []

    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .where(TestCase.id.in_(payload.case_ids))
        .where(TestCase.status != ARCHIVED)
    )
    originals = result.scalars().all()
    if not originals:
        raise HTTPException(status_code=404, detail="No matching TestCases found")

    # Preserve the caller's selection order so the clones land predictably.
    by_id = {c.id: c for c in originals}
    ordered = [by_id[cid] for cid in payload.case_ids if cid in by_id]

    clones: list[TestCase] = []
    for original in ordered:
        clone = TestCase(
            title=f"{original.title} (Copy)",
            **{f: getattr(original, f) for f in _CLONE_FIELDS},
        )
        clone.version = 0
        clone.external_id = None  # re-generated after flush so it stays unique
        db.add(clone)
        await db.flush()  # assign clone.id
        clone.external_id = f"{EXTERNAL_ID_PREFIX}{EXTERNAL_ID_OFFSET + clone.id}"

        for step in sorted(original.steps, key=lambda s: s.order):
            if step.status == ARCHIVED:
                continue
            db.add(TestStep(
                test_case_id=clone.id,
                order=step.order,
                action=step.action,
                data=step.data,
                expected_result=step.expected_result,
                status=step.status,
            ))

        db.add(TestCaseHistory(
            case_id=clone.id,
            user_id=1,
            action="Created",
            changed_fields=json.dumps(
                {"cloned_from": original.id, "title": clone.title},
                ensure_ascii=False,
            ),
        ))
        clones.append(clone)

    await db.commit()
    await record_audit(
        db, request, actor,
        action="clone_case_batch",
        resource_type="test_case",
        resource_id=None,
        metadata={"source_case_ids": [c.id for c in ordered], "clone_count": len(clones)},
    )

    # Reload with steps for the response (avoids lazy-load on the detached clones).
    clone_ids = [c.id for c in clones]
    reload_res = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
        .where(TestCase.id.in_(clone_ids))
    )
    reloaded = {c.id: c for c in reload_res.scalars().all()}
    return [reloaded[cid] for cid in clone_ids if cid in reloaded]


@router.get("/{case_id}", response_model=TestCaseResponse)
async def get_case(case_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
        .where(TestCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")
    return case

@router.put("/{case_id}", response_model=TestCaseResponse)
async def update_case(case_id: int, case_in: TestCaseUpdate, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    # KQT-15246: only load active step rows. Without this filter every
    # archived row from prior edits would land in `existing_steps` and the
    # soft-delete loop below would redundantly re-stamp `status = "Archived"`
    # on already-archived rows. Combined with the frontend now sending
    # step.id back to us, this means a routine edit no longer creates a new
    # row + archives the old one (the previous flow was producing a fresh
    # archived twin on every save, which made the test cycle view double
    # up the step list once duplicates crept into the active set).
    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
        .where(TestCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")

    # Optimistic locking：若 client 帶了 version，檢查是否與 DB 一致
    if case_in.version is not None and case.version != case_in.version:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "conflict",
                "message": f"「{case.title}」已被他人修改，請重新整理後再編輯",
                "case_title": case.title,
                "current_version": case.version,
            },
        )

    update_data = case_in.model_dump(exclude={"steps", "version", "external_id"}, exclude_unset=True)
    # KQT TCMS hardening: same priority normalisation as create_case, applied
    # here so editing a legacy "FAST" / "Highest" case through the editor
    # silently rewrites the column to a canonical value the dropdown can render.
    if "priority" in update_data:
        update_data["priority"] = normalize_priority(update_data.get("priority"))
    # Same hardening for status (folds legacy "Active" → Draft on edit). The
    # editor must never soft-delete by setting status=Archived — refuse it; the
    # delete endpoint is the only legitimate way to reach Archived.
    if "status" in update_data:
        normalized_status = normalize_status(update_data.get("status"))
        if normalized_status == ARCHIVED:
            raise HTTPException(
                status_code=400,
                detail="不可將 status 設為 Archived；刪除請走刪除 API",
            )
        update_data["status"] = normalized_status

    # Track changed fields
    changes = {}
    for key, value in update_data.items():
        old_val = getattr(case, key)
        if old_val != value:
            changes[key] = f"{old_val} -> {value}"
        setattr(case, key, value)

    # 每次成功更新，version + 1
    case.version = case.version + 1
    
    # Handle steps (Smart Update)
    steps_changed = False
    if case_in.steps is not None:
        steps_changed = True
        existing_steps = {s.id: s for s in case.steps}
        incoming_step_ids = {s.id for s in case_in.steps if s.id is not None}
        
        # 1. Update or Insert
        for step_in in case_in.steps:
            if step_in.id and step_in.id in existing_steps:
                # Update existing
                step = existing_steps[step_in.id]
                for key, value in step_in.model_dump(exclude={"id"}).items():
                    setattr(step, key, value)
                step.status = "Active" # Ensure it's active if it was archived
            else:
                # Insert new
                new_step = TestStep(**step_in.model_dump(exclude={"id"}), test_case_id=case.id)
                db.add(new_step)
        
        # 2. Soft-Delete Orphans
        for step_id, step in existing_steps.items():
            if step_id not in incoming_step_ids:
                step.status = ARCHIVED
                # To really "un-link" it from the current case view if needed, 
                # but we usually just filter it out in the relationship query.
            
    if steps_changed:
        changes["steps"] = "測試步驟已更新"

    if changes:
        history = TestCaseHistory(
            case_id=case.id,
            user_id=1,  # Hardcoded
            action="Updated",
            changed_fields=json.dumps(changes, ensure_ascii=False)
        )
        db.add(history)

    await db.commit()
    
    # Reload
    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .options(with_loader_criteria(TestStep, TestStep.status != ARCHIVED))
        .where(TestCase.id == case.id)
    )
    return result.scalar_one()

@router.delete("/{case_id}")
async def delete_case(
    case_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    case = await db.get(TestCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")

    case.status = ARCHIVED

    # Create history record
    history = TestCaseHistory(
        case_id=case.id,
        user_id=1,
        action="Archived",
        changed_fields=json.dumps({"status": "Active -> Archived"}, ensure_ascii=False)
    )
    db.add(history)

    await db.commit()
    await record_audit(
        db, request, actor,
        action="delete_case",
        resource_type="test_case",
        resource_id=case_id,
    )
    return {"message": "TestCase archived successfully"}

@router.post("/{case_id}/restore")
async def restore_case(
    case_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    case = await db.get(TestCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")

    if case.status != ARCHIVED:
        return {"message": "TestCase is not archived"}

    # Restore to the canonical entry state (Draft), not the legacy "Active"
    # value the lifecycle is being folded away from. The original pre-archive
    # lifecycle isn't recoverable (Archived overwrote it), so Draft is the
    # safe re-entry point.
    case.status = DRAFT

    # Create history record
    history = TestCaseHistory(
        case_id=case.id,
        user_id=1,
        action="Restored",
        changed_fields=json.dumps({"status": f"{ARCHIVED} -> {DRAFT}"}, ensure_ascii=False)
    )
    db.add(history)

    await db.commit()
    await record_audit(
        db, request, actor,
        action="restore_case",
        resource_type="test_case",
        resource_id=case_id,
    )
    return {"message": "TestCase restored successfully"}

@router.get("/{case_id}/history", response_model=List[TestCaseHistoryResponse])
async def get_case_history(case_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestCaseHistory)
        .options(selectinload(TestCaseHistory.user))
        .where(TestCaseHistory.case_id == case_id)
        .order_by(TestCaseHistory.created_at.desc())
    )
    return result.scalars().all()
