from typing import Optional
from pydantic import BaseModel

class TestStepResultBase(BaseModel):
    status: str = "Untested"
    actual_result: Optional[str] = None

class TestStepResultCreate(TestStepResultBase):
    test_result_id: int
    test_step_id: int

class TestStepResultUpdate(TestStepResultBase):
    pass

class TestStepResultResponse(TestStepResultBase):
    id: int
    test_result_id: int
    test_step_id: int

    class Config:
        from_attributes = True
