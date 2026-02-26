from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.db.database import get_db
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
    db_folder = await db.get(TestRunFolder, folder_id)
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Optional logic: cascade delete runs inside this folder or nullify them.
    # Currently just deleting the folder. The SQLAlchemy relationships config handles cascade if setup.
    await db.delete(db_folder)
    await db.commit()
    return {"message": "Folder deleted successfully"}
