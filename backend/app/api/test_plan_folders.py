from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel

from app.db.database import get_db
from app.models.test_plan_folder import TestPlanFolder

router = APIRouter()

class FolderCreate(BaseModel):
    name: str
    project_id: int
    parent_id: Optional[int] = None

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

class FolderResponse(BaseModel):
    id: int
    name: str
    project_id: int
    parent_id: Optional[int] = None

    class Config:
        from_attributes = True

@router.get("/", response_model=List[FolderResponse])
async def get_plan_folders(project_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(TestPlanFolder)
    if project_id:
        query = query.where(TestPlanFolder.project_id == project_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/project/{project_id}", response_model=List[FolderResponse])
async def get_plan_folders_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestPlanFolder).where(TestPlanFolder.project_id == project_id))
    return result.scalars().all()

@router.post("/", response_model=FolderResponse)
async def create_plan_folder(folder: FolderCreate, db: AsyncSession = Depends(get_db)):
    db_folder = TestPlanFolder(**folder.model_dump())
    db.add(db_folder)
    await db.commit()
    await db.refresh(db_folder)
    return db_folder

@router.put("/{folder_id}", response_model=FolderResponse)
async def update_plan_folder(folder_id: int, folder_update: FolderUpdate, db: AsyncSession = Depends(get_db)):
    db_folder = await db.get(TestPlanFolder, folder_id)
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    update_data = folder_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_folder, key, value)
    await db.commit()
    await db.refresh(db_folder)
    return db_folder

@router.delete("/{folder_id}")
async def delete_plan_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    db_folder = await db.get(TestPlanFolder, folder_id)
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.delete(db_folder)
    await db.commit()
    return {"message": "Folder deleted"}
