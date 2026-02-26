from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class TestSuiteBase(BaseModel):
    name: str
    description: Optional[str] = None
    preconditions: Optional[str] = None
    parent_suite_id: Optional[int] = None

class TestSuiteCreate(TestSuiteBase):
    project_id: int

class TestSuiteUpdate(TestSuiteBase):
    name: Optional[str] = None

class TestSuiteResponse(TestSuiteBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    cases: Optional[int] = 0

    class Config:
        from_attributes = True
