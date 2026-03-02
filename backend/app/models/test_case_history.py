from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, backref
from app.db.database import Base

class TestCaseHistory(Base):
    __tablename__ = "tcms_test_cases_history"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("tcms_test_cases.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("tcms_users.id"), nullable=True) # Who made the change
    action = Column(String, nullable=False) # e.g., "Created", "Updated", "Status Changed"
    changed_fields = Column(String, nullable=True) # JSON string summarising what changed
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    test_case = relationship(
        "TestCase",
        backref=backref("history", passive_deletes=True),
        passive_deletes=True,
    )
