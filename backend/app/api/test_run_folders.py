from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.api.deps import record_audit, require_role
from app.db.database import get_db
from app.models.test_run import TestRun
from app.models.test_run_folder import TestRunFolder
from app.models.user import User
from app.schemas.test_run_folder import TestRunFolderCreate, TestRunFolderUpdate, TestRunFolderResponse

router = APIRouter()

# PR-3 (#): writes go to Admin / QA only; reads stay open to any logged-in user
# until later phases. record_audit is called for destructive actions (delete)
# so we can answer "who archived which folder when" post-hoc.

@router.get("/project/{project_id}", response_model=List[TestRunFolderResponse])
async def list_folders_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestRunFolder)
        .where(TestRunFolder.project_id == project_id)
        .where(TestRunFolder.status != "Archived")
        .order_by(TestRunFolder.id)
    )
    return result.scalars().all()

@router.post("/", response_model=TestRunFolderResponse)
async def create_folder(
    folder_in: TestRunFolderCreate,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(require_role("Admin", "QA")),
):
    db_folder = TestRunFolder(**folder_in.model_dump())
    db.add(db_folder)
    await db.commit()
    await db.refresh(db_folder)
    return db_folder

@router.put("/{folder_id}", response_model=TestRunFolderResponse)
async def update_folder(
    folder_id: int,
    folder_in: TestRunFolderUpdate,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(require_role("Admin", "QA")),
):
    db_folder = await db.get(TestRunFolder, folder_id)
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    update_data = folder_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_folder, key, value)
    
    await db.commit()
    await db.refresh(db_folder)
    return db_folder

@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    """KQT-15346: soft-archive the folder, all descendant folders, and every TestRun inside.

    Matches the existing `status="Archived"` pattern used by tcms_test_runs / tcms_test_plans /
    tcms_test_cases — rows stay in the DB and can be restored later.
    """
    db_folder = await db.get(TestRunFolder, folder_id)
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # BFS over project's folders to collect this folder + all descendants.
    rows = await db.execute(
        select(TestRunFolder.id, TestRunFolder.parent_id)
        .where(TestRunFolder.project_id == db_folder.project_id)
    )
    children_by_parent: dict[int | None, list[int]] = {}
    for fid, pid in rows.all():
        children_by_parent.setdefault(pid, []).append(fid)

    folder_ids_in_scope: list[int] = []
    seen: set[int] = set()
    queue: list[int] = [folder_id]
    while queue:
        cur = queue.pop(0)
        if cur in seen:  # defensive — parent_id has no DB-side cycle guard
            continue
        seen.add(cur)
        folder_ids_in_scope.append(cur)
        queue.extend(children_by_parent.get(cur, []))

    # Archive runs in scope (skip already-archived; the count below is "newly archived").
    runs_result = await db.execute(
        select(TestRun)
        .where(TestRun.folder_id.in_(folder_ids_in_scope))
        .where(TestRun.status != "Archived")
    )
    runs = runs_result.scalars().all()
    for run in runs:
        run.status = "Archived"

    # Archive the folders themselves.
    folders_result = await db.execute(
        select(TestRunFolder)
        .where(TestRunFolder.id.in_(folder_ids_in_scope))
        .where(TestRunFolder.status != "Archived")
    )
    folders_to_archive = folders_result.scalars().all()
    for f in folders_to_archive:
        f.status = "Archived"

    await db.commit()
    await record_audit(
        db, request, actor,
        action="delete_run_folder",
        resource_type="test_run_folder",
        resource_id=folder_id,
        metadata={"archived_folders": len(folders_to_archive), "archived_runs": len(runs)},
    )
    return {
        "message": "Folder archived successfully",
        "archived_folders": len(folders_to_archive),
        "archived_runs": len(runs),
    }
