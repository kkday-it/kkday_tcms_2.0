from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class TestStepBase(BaseModel):
    action: str
    data: Optional[str] = None
    expected_result: Optional[str] = None
    order: int = 1

class TestStepCreate(TestStepBase):
    pass

class TestStepResponse(TestStepBase):
    id: int
    test_case_id: int

    class Config:
        from_attributes = True

class TestCaseBase(BaseModel):
    title: str
    status: Optional[str] = "Active"
    lifecycle_status: Optional[str] = "Draft"
    description: Optional[str] = None
    severity: Optional[str] = "Normal"
    priority: Optional[str] = "Not Set"
    type: Optional[str] = None
    layer: Optional[str] = None
    behavior: Optional[str] = "Not Set"
    automation_status: Optional[str] = "Manual"
    is_flaky: Optional[bool] = False
    muted: Optional[bool] = False
    preconditions: Optional[str] = None
    postconditions: Optional[str] = None
    
    # Zephyr / Legacy Integration Fields
    external_id: Optional[str] = None
    tags: Optional[str] = None
    labels: Optional[str] = None
    jira_keys: Optional[str] = None
    
    default_owner_id: Optional[int] = None

class TestCaseCreate(TestCaseBase):
    suite_id: int
    steps: Optional[List[TestStepCreate]] = []

class TestCaseUpdate(TestCaseBase):
    title: Optional[str] = None
    suite_id: Optional[int] = None
    steps: Optional[List[TestStepCreate]] = None

class TestCaseResponse(TestCaseBase):
    id: int
    suite_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    steps: List[TestStepResponse] = []

    class Config:
        from_attributes = True

class TestCaseBatchDelete(BaseModel):
    case_ids: List[int]

class TestCaseBatchMove(BaseModel):
    case_ids: List[int]
    suite_id: int
