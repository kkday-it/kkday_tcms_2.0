from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestRunFolder(Base):
    __tablename__ = "test_run_folders"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("test_run_folders.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project")
    
    # Establish parent-child relationship for folders
    sub_folders = relationship("TestRunFolder", backref="parent_folder", remote_side=[id])
    
    # Optional definition to link back to test runs inside this folder
    # runs = relationship("TestRun", back_populates="folder")
