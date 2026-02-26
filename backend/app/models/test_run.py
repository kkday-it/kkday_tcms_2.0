from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    folder_id = Column(Integer, ForeignKey("test_run_folders.id"), nullable=True)
    test_plan_id = Column(Integer, ForeignKey("test_plans.id"), nullable=True)
    title = Column(String, index=True, nullable=False)
    run_type = Column(String, default="Feature Test")
    description = Column(String, nullable=True)
    status = Column(String, default="Pending") # Pending, Testing, Done
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="runs")
    folder = relationship("TestRunFolder", backref="runs")
    test_plan = relationship("TestPlan", foreign_keys=[test_plan_id])
    assignee = relationship("User", backref="assigned_runs")
    results = relationship("TestResult", back_populates="run", cascade="all, delete-orphan")
