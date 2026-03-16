from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestStep(Base):
    __tablename__ = "tcms_test_steps"

    id = Column(Integer, primary_key=True, index=True)
    test_case_id = Column(Integer, ForeignKey("tcms_test_cases.id"), nullable=False)
    order = Column(Integer, nullable=False, default=1)
    action = Column(String, nullable=False)
    data = Column(String, nullable=True)
    expected_result = Column(String, nullable=True)
    status = Column(String, default="Active")  # Active, Archived

    test_case = relationship("TestCase", back_populates="steps")
