"""JWT 簽發驗證 + FastAPI 相依（目前使用者 / 管理員）。

密碼雜湊在 crypto.py（低階層），避免與 user_service 循環 import。
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import settings
from services import user_service

_bearer = HTTPBearer(auto_error=False)


# ── JWT ─────────────────────────────────────────────────
def create_access_token(user_id: int, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


# ── FastAPI 相依 ────────────────────────────────────────
def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """從 Authorization: Bearer <token> 解出使用者；失敗一律 401。"""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未登入或登入已過期",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    try:
        payload = _decode_token(creds.credentials)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise unauthorized

    # 每次都回資料庫確認，帳號被停用 / 刪除可即時生效
    user = user_service.get_user(user_id)
    if user is None or not user["is_active"]:
        raise unauthorized
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="需要管理員權限")
    return user
