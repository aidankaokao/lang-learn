"""註冊 / 登入 / 目前使用者。掛載後路徑為 /api/auth/*。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from security import create_access_token, get_current_user
from services import user_service

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


def _token_response(user: dict) -> TokenOut:
    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenOut(access_token=token, user=user)


@router.post("/register", response_model=TokenOut)
def register(body: Credentials):
    if not settings.allow_registration:
        raise HTTPException(status_code=403, detail="目前未開放自由註冊，請聯絡管理員建立帳號")
    try:
        user = user_service.create_user(body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _token_response(user)


@router.post("/login", response_model=TokenOut)
def login(body: Credentials):
    try:
        user = user_service.authenticate(body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return _token_response(user)


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    # 改密碼一律重新驗證舊密碼，避免 token 被盜後直接改密碼鎖住帳號
    try:
        user_service.authenticate(user["username"], body.old_password)
    except ValueError:
        raise HTTPException(status_code=400, detail="舊密碼錯誤")
    try:
        user_service.change_password(user["id"], body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
