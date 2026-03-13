from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class UserBase(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True

class TestPlanHistoryResponse(BaseModel):
    id: int
    plan_id: int
    user_id: Optional[int] = None
    action: str
    changed_fields: Optional[str] = None
    created_at: datetime
    user: Optional[UserBase] = None

    class Config:
        from_attributes = True
