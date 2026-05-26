from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.db.database import get_db
from app.models.test_run import TestRun
from app.models.test_run_folder import TestRunFolder
from app.schemas.test_run_folder import TestRunFolderCreate, TestRunFolderUpdate, TestRunFolderResponse

router = APIRouter()

@router.get("/project/{project_id}", response_model=List[TestRunFolderResponse])
async def list_folders_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestRunFolder)
        .where(TestRunFolder.project_id == project_id)
        .order_by(TestRunFolder.id)
    )
    return result.scalars().all()

@router.post("/", response_model=TestRunFolderResponse)
async def create_folder(folder_in: TestRunFolderCreate, db: AsyncSession = Depends(get_db)):
    db_folder = TestRunFolder(**folder_in.model_dump())
    db.add(db_folder)
    await db.commit()
    await db.refresh(db_folder)
    return db_folder

@router.put("/{folder_id}", response_model=TestRunFolderResponse)
async def update_folder(folder_id: int, folder_in: TestRunFolderUpdate, db: AsyncSession = Depends(get_db)):
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
async def delete_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    """KQT-15346: cascade-delete the folder, all descendant folders, and every TestRun inside them.

    `TestRun.results` already cascades to TestResult / TestStepResult, so deleting each run
    via the ORM is sufficient to clean up the entire subtree.
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

    folder_ids_in_order: list[int] = []
    seen: set[int] = set()
    queue: list[int] = [folder_id]
    while queue:
        cur = queue.pop(0)
        if cur in seen:  # defensive — parent_id has no DB-side cycle guard
            continue
        seen.add(cur)
        folder_ids_in_order.append(cur)
        queue.extend(children_by_parent.get(cur, []))

    # Delete runs first so SQLAlchemy fires the results/step_results cascade.
    runs_result = await db.execute(
        select(TestRun).where(TestRun.folder_id.in_(folder_ids_in_order))
    )
    runs = runs_result.scalars().all()
    for run in runs:
        await db.delete(run)
    # Flush so the run deletes are issued before folder deletes (FK order matters).
    await db.flush()

    # Delete folders bottom-up: BFS order is parent-first, so reverse for delete.
    for fid in reversed(folder_ids_in_order):
        folder_obj = await db.get(TestRunFolder, fid)
        if folder_obj is not None:
            await db.delete(folder_obj)

    await db.commit()
    return {
        "message": "Folder deleted successfully",
        "deleted_folders": len(folder_ids_in_order),
        "deleted_runs": len(runs),
    }
