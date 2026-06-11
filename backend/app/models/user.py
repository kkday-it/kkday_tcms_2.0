from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.db.database import Base

class User(Base):
    __tablename__ = "tcms_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="QA") # Admin, QA, RD, Tester
    hashed_password = Column(String, nullable=True) # Optional for now to not break existing data
    is_active = Column(Boolean, default=True)
    force_change_password = Column(Boolean, default=True)
    google_id = Column(String, unique=True, nullable=True)  # Google OAuth subject ID

    last_login = Column(DateTime(timezone=True), nullable=True)  # set on each successful login (password + Google SSO)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
