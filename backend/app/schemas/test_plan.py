from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class DocLink(BaseModel):
    title: Optional[str] = None
    url: str


class TimelineQaEntry(BaseModel):
    platform: str  # APP | PC | M
    start: str
    end: str


class TimelineData(BaseModel):
    rd: Optional[dict] = None  # {start, end}
    ued: Optional[dict] = None  # {start, end}
    qa: Optional[List[TimelineQaEntry]] = None


class TestPlanBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "Draft"


class TestPlanCreate(TestPlanBase):
    project_id: int
    folder_id: Optional[int] = None
    run_ids: Optional[List[int]] = []
    case_ids: Optional[List[int]] = []
    prd_url: Optional[str] = None
    sa_docs: Optional[List[dict]] = None
    sd_docs: Optional[List[dict]] = None
    timeline: Optional[dict] = None
    jira_unfix_filter_id: Optional[int] = None
    jira_total_filter_id: Optional[int] = None
    jira_display_fields: Optional[List[str]] = None


class TestPlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    folder_id: Optional[int] = None
    run_ids: Optional[List[int]] = None
    case_ids: Optional[List[int]] = None
    prd_url: Optional[str] = None
    sa_docs: Optional[List[dict]] = None
    sd_docs: Optional[List[dict]] = None
    timeline: Optional[dict] = None
    jira_unfix_filter_id: Optional[int] = None
    jira_total_filter_id: Optional[int] = None
    jira_display_fields: Optional[List[str]] = None


class TestPlanResponse(TestPlanBase):
    id: int
    project_id: int
    folder_id: Optional[int] = None
    run_ids: List[int] = []
    case_ids: List[int] = []
    prd_url: Optional[str] = None
    sa_docs: Optional[List[dict]] = None
    sd_docs: Optional[List[dict]] = None
    timeline: Optional[dict] = None
    jira_unfix_filter_id: Optional[int] = None
    jira_total_filter_id: Optional[int] = None
    jira_display_fields: Optional[List[str]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
