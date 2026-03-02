from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestPlanFolder(Base):
    __tablename__ = "tcms_test_plan_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    project_id = Column(Integer, ForeignKey("tcms_projects.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("tcms_test_plan_folders.id", ondelete="CASCADE"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    children = relationship("TestPlanFolder", backref="parent", remote_side=[id])
    plans = relationship("TestPlan", backref="folder", lazy="dynamic")
