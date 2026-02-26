from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    suite_id = Column(Integer, ForeignKey("test_suites.id"), nullable=False)
    title = Column(String, index=True, nullable=False)
    status = Column(String, default="Active")
    lifecycle_status = Column(String, default="Draft") # Draft, Approved
    description = Column(String, nullable=True)
    severity = Column(String, default="Normal")
    priority = Column(String, default="Not Set")
    type = Column(String, nullable=True)
    layer = Column(String, nullable=True)
    behavior = Column(String, default="Not Set")
    automation_status = Column(String, default="Manual")
    is_flaky = Column(Boolean, default=False)
    muted = Column(Boolean, default=False)
    preconditions = Column(String, nullable=True)
    postconditions = Column(String, nullable=True)
    
    default_owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Zephyr / Legacy Integration Fields
    external_id = Column(String, index=True, nullable=True)
    tags = Column(String, nullable=True) # Stored as JSON string or comma-separated
    jira_keys = Column(String, nullable=True) # Stored as comma-separated
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    suite = relationship("TestSuite", back_populates="test_cases")
    steps = relationship("TestStep", back_populates="test_case", cascade="all, delete-orphan", order_by="TestStep.order")
    results = relationship("TestResult", back_populates="test_case", cascade="all, delete-orphan")
    default_owner = relationship("User", backref="owned_cases")
