from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.db.database import Base


class AuditLog(Base):
    """Append-only record of who did what. Written by `record_audit()` in app/api/deps.py
    from inside endpoint handlers."""

    __tablename__ = "tcms_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(
        Integer,
        ForeignKey("tcms_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_role = Column(String(32), nullable=True)
    action = Column(String(64), nullable=False, index=True)
    resource_type = Column(String(64), nullable=False, index=True)
    resource_id = Column(String(64), nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
