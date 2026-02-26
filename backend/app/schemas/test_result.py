from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class TestResultBase(BaseModel):
    status: Optional[str] = "Untested"
    duration_ms: Optional[int] = None
    comment: Optional[str] = None
    jira_bug_id: Optional[str] = None
    attachment_url: Optional[str] = None
    assignee_id: Optional[int] = None

class TestResultCreate(TestResultBase):
    run_id: int
    case_id: int

class TestResultUpdate(TestResultBase):
    status: Optional[str] = None

class TestResultResponse(TestResultBase):
    id: int
    run_id: int
    case_id: int
    executed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
