from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Table
from sqlalchemy import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

# Association tables
plan_runs = Table(
    "tcms_plan_runs",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("tcms_test_plans.id", ondelete="CASCADE"), primary_key=True),
    Column("run_id", Integer, ForeignKey("tcms_test_runs.id", ondelete="CASCADE"), primary_key=True),
)

plan_cases = Table(
    "tcms_plan_cases",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("tcms_test_plans.id", ondelete="CASCADE"), primary_key=True),
    Column("case_id", Integer, ForeignKey("tcms_test_cases.id", ondelete="CASCADE"), primary_key=True),
)

class TestPlan(Base):
    __tablename__ = "tcms_test_plans"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("tcms_projects.id"), nullable=False)
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="Draft")
    folder_id = Column(Integer, ForeignKey("tcms_test_plan_folders.id", ondelete="SET NULL"), nullable=True)

    # PRD / SA / SD / UED / QA / Mindmap
    prd_url = Column(Text, nullable=True)
    sa_docs = Column(JSON, nullable=True)  # [{title, url}, ...]
    sd_docs = Column(JSON, nullable=True)  # [{title, url}, ...]
    ued_docs = Column(JSON, nullable=True) # [{title, url}, ...]
    qa_docs = Column(JSON, nullable=True)  # [{title, url}, ...]
    mindmap_url = Column(Text, nullable=True)

    # Timeline: {rd: {start,end}, ued: {...}, qa: [{platform,start,end},...]}
    timeline = Column(JSON, nullable=True)

    # Jira: filter id from https://kkday.atlassian.net/issues/?filter=18523
    jira_unfix_filter_id = Column(Integer, nullable=True)
    jira_total_filter_id = Column(Integer, nullable=True)
    jira_display_fields = Column(JSON, nullable=True)  # ['key','summary','status','assignee','priority']
    jira_chart_filter_id = Column(Integer, nullable=True)
    jira_chart_field = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", backref="test_plans")
    linked_runs = relationship("TestRun", secondary=plan_runs, lazy="selectin")
    linked_cases = relationship("TestCase", secondary=plan_cases, lazy="selectin")
