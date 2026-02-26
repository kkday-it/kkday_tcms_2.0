from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class TestRunFolderBase(BaseModel):
    name: str
    parent_id: Optional[int] = None

class TestRunFolderCreate(TestRunFolderBase):
    project_id: int

class TestRunFolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

class TestRunFolderResponse(TestRunFolderBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
