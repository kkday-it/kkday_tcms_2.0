from pydantic import BaseModel, EmailStr

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserPasswordReset(BaseModel):
    email: EmailStr
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    role: str
    require_password_change: bool

class UserChangePassword(BaseModel):
    user_id: int
    new_password: str
