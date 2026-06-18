import unicodedata
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator

class AssigneeInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True

class TestRunBase(BaseModel):
    title: str
    run_type: Optional[str] = "Feature Test"
    description: Optional[str] = None
    status: Optional[str] = "Pending"
    # Legacy single-assignee kept for backward compat
    assignee_id: Optional[int] = None
    # New: list of user IDs to assign to this run
    assignee_ids: Optional[List[int]] = None

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
    case_ids: Optional[List[int]] = None

class BulkCopyRunsRequest(BaseModel):
    """Request body for bulk-copying a folder's runs."""

    run_ids: List[int] = Field(..., min_length=1, max_length=1000)
    date_string: str = Field(..., min_length=1, max_length=100)

    @field_validator("run_ids")
    @classmethod
    def no_duplicate_ids(cls, v: List[int]) -> List[int]:
        """Reject duplicate run_ids to prevent accidental multi-copy of the same run."""
        if len(v) != len(set(v)):
            raise ValueError("run_ids must not contain duplicate values")
        return v

    @field_validator("date_string")
    @classmethod
    def no_control_chars(cls, v: str) -> str:
        """Reject Unicode control characters (Cc category) to prevent malformed titles.

        Covers ASCII controls (0x00–0x1F), DEL (0x7F), and C1 controls (0x80–0x9F).
        """
        if any(unicodedata.category(c) == "Cc" for c in v):
            raise ValueError("date_string must not contain control characters")
        return v


class TestRunResponse(TestRunBase):
    id: int
    external_id: Optional[str] = None
    project_id: int
    folder_id: Optional[int] = None
    test_plan_id: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    passed: Optional[int] = 0
    failed: Optional[int] = 0
    blocked: Optional[int] = 0
    skipped: Optional[int] = 0
    untested: Optional[int] = 0
    total: Optional[int] = 0
    # Resolved assignee info
    assignees: Optional[List[AssigneeInfo]] = []
    # True when `assignees` was derived from the run's case executors
    # (default_owner per result) because no run-level assignee was set.
    assignees_derived: bool = False

    class Config:
        from_attributes = True
