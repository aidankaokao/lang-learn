"""管理員的帳號管理。掛載後路徑為 /api/admin/users*，全部需要 admin 權限。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from security import require_admin
from services import user_service

router = APIRouter(prefix="/admin/users", tags=["admin"])


class CreateUserIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=4, max_length=128)
    role: str = "user"


class UpdateUserIn(BaseModel):
    is_active: bool | None = None
    role: str | None = None


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=4, max_length=128)


@router.get("")
def list_users(_: dict = Depends(require_admin)):
    return user_service.list_users()


@router.post("", status_code=201)
def create_user(body: CreateUserIn, _: dict = Depends(require_admin)):
    try:
        return user_service.create_user(body.username, body.password, body.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{user_id}")
def update_user(user_id: int, body: UpdateUserIn, admin: dict = Depends(require_admin)):
    if user_service.get_user(user_id) is None:
        raise HTTPException(status_code=404, detail="找不到此帳號")
    if user_id == admin["id"] and (body.is_active is False or body.role == "user"):
        raise HTTPException(status_code=400, detail="不能停用或降級自己的帳號")

    try:
        result = None
        if body.role is not None:
            result = user_service.set_role(user_id, body.role)
        if body.is_active is not None:
            result = user_service.set_active(user_id, body.is_active)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result or user_service.get_user(user_id)


@router.post("/{user_id}/password", status_code=204)
def reset_password(user_id: int, body: ResetPasswordIn, _: dict = Depends(require_admin)):
    if user_service.get_user(user_id) is None:
        raise HTTPException(status_code=404, detail="找不到此帳號")
    try:
        user_service.change_password(user_id, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_service.get_user(user_id) is None:
        raise HTTPException(status_code=404, detail="找不到此帳號")
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="不能刪除自己的帳號")
    try:
        user_service.delete_user(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
