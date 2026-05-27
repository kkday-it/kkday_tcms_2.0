from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ApiTokenCreate(BaseModel):
    label: Optional[str] = None
    # Days until expiry. None = no expiry (long-lived bot token).
    expires_in_days: Optional[int] = None


class ApiTokenResponse(BaseModel):
    """List-view shape. Never includes the raw token."""

    id: int
    label: Optional[str]
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApiTokenCreateResponse(ApiTokenResponse):
    """Returned only at creation — the raw token is shown once, then never again."""

    token: str
