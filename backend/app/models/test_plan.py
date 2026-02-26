from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Table
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

# Association tables
plan_runs = Table(
    "plan_runs",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("test_plans.id", ondelete="CASCADE"), primary_key=True),
    Column("run_id", Integer, ForeignKey("test_runs.id", ondelete="CASCADE"), primary_key=True),
)

plan_cases = Table(
    "plan_cases",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("test_plans.id", ondelete="CASCADE"), primary_key=True),
    Column("case_id", Integer, ForeignKey("test_cases.id", ondelete="CASCADE"), primary_key=True),
)

class TestPlan(Base):
    __tablename__ = "test_plans"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="Draft")
    folder_id = Column(Integer, ForeignKey("test_plan_folders.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", backref="test_plans")
    linked_runs = relationship("TestRun", secondary=plan_runs, lazy="selectin")
    linked_cases = relationship("TestCase", secondary=plan_cases, lazy="selectin")
