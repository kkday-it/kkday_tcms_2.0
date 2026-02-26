from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class TestRunBase(BaseModel):
    title: str
    run_type: Optional[str] = "Feature Test"
    description: Optional[str] = None
    status: Optional[str] = "Pending"

class TestRunCreate(TestRunBase):
    project_id: int
    folder_id: Optional[int] = None
    test_plan_id: Optional[int] = None
    case_ids: Optional[List[int]] = None

class TestRunUpdate(TestRunBase):
    title: Optional[str] = None
    status: Optional[str] = None
    folder_id: Optional[int] = None
    test_plan_id: Optional[int] = None

class TestRunResponse(TestRunBase):
    id: int
    project_id: int
    folder_id: Optional[int] = None
    test_plan_id: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime]
    passed: Optional[int] = 0
    failed: Optional[int] = 0
    untested: Optional[int] = 0

    class Config:
        from_attributes = True
