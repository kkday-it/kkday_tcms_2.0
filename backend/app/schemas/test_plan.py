from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TestPlanBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "Draft"

class TestPlanCreate(TestPlanBase):
    project_id: int
    folder_id: Optional[int] = None
    run_ids: Optional[List[int]] = []
    case_ids: Optional[List[int]] = []

class TestPlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    folder_id: Optional[int] = None
    run_ids: Optional[List[int]] = None
    case_ids: Optional[List[int]] = None

class TestPlanResponse(TestPlanBase):
    id: int
    project_id: int
    folder_id: Optional[int] = None
    run_ids: List[int] = []
    case_ids: List[int] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
