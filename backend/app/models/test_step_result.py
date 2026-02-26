from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class TestStepResult(Base):
    __tablename__ = "test_step_results"

    id = Column(Integer, primary_key=True, index=True)
    test_result_id = Column(Integer, ForeignKey("test_results.id"), nullable=False)
    test_step_id = Column(Integer, ForeignKey("test_steps.id"), nullable=False)
    status = Column(String, default="Untested") # Untested, Passed, Failed
    actual_result = Column(String, nullable=True)

    test_result = relationship("TestResult", back_populates="step_results")
    test_step = relationship("TestStep")

