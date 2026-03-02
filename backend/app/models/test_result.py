from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestResult(Base):
    __tablename__ = "tcms_test_results"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("tcms_test_runs.id"), nullable=False)
    case_id = Column(Integer, ForeignKey("tcms_test_cases.id"), nullable=False)
    status = Column(String, default="Untested") # Untested, Passed, Failed, Blocked, Skipped
    duration_ms = Column(Integer, nullable=True)
    comment = Column(String, nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Bug tracking fields
    jira_bug_id = Column(String, nullable=True)
    attachment_url = Column(String, nullable=True)

    assignee_id = Column(Integer, ForeignKey("tcms_users.id"), nullable=True)

    run = relationship("TestRun", back_populates="results")
    test_case = relationship("TestCase", back_populates="results")
    step_results = relationship("TestStepResult", back_populates="test_result", cascade="all, delete-orphan")
    assignee = relationship("User", backref="assigned_results")
