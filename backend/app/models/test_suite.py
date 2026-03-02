from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestSuite(Base):
    __tablename__ = "tcms_test_suites"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("tcms_projects.id"), nullable=False)
    parent_suite_id = Column(Integer, ForeignKey("tcms_test_suites.id"), nullable=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    preconditions = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", back_populates="suites")
    parent = relationship("TestSuite", remote_side=[id], back_populates="children")
    children = relationship("TestSuite", back_populates="parent", cascade="all, delete-orphan")
    test_cases = relationship("TestCase", back_populates="suite", cascade="all, delete-orphan")
