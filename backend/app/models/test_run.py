from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Table
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

# Many-to-many association table for test_run <-> user assignees
test_run_assignees = Table(
    "tcms_test_run_assignees",
    Base.metadata,
    Column("test_run_id", Integer, ForeignKey("tcms_test_runs.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("tcms_users.id", ondelete="CASCADE"), primary_key=True),
)

class TestRun(Base):
    __tablename__ = "tcms_test_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("tcms_projects.id"), nullable=False)
    folder_id = Column(Integer, ForeignKey("tcms_test_run_folders.id"), nullable=True)
    test_plan_id = Column(Integer, ForeignKey("tcms_test_plans.id"), nullable=True)
    title = Column(String, index=True, nullable=False)
    run_type = Column(String, default="Feature Test")
    description = Column(String, nullable=True)
    status = Column(String, default="Pending")  # Pending, Testing, Done
    # Keep legacy column for backward compat but suppress its usage
    assignee_id = Column(Integer, ForeignKey("tcms_users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="runs")
    folder = relationship("TestRunFolder", backref="runs")
    test_plan = relationship("TestPlan", foreign_keys=[test_plan_id])
    # Legacy single-assignee (kept for DB compat)
    assignee = relationship("User", foreign_keys=[assignee_id], backref="assigned_runs_legacy")
    # Many-to-many assignees
    assignees = relationship("User", secondary="tcms_test_run_assignees", lazy="selectin")
    results = relationship("TestResult", back_populates="run", cascade="all, delete-orphan")
