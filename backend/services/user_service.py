"""帳號相關商業邏輯（SQLAlchemy Core，見 database.md §5）。

路由薄、service 厚：這裡不碰 HTTP，錯誤一律丟 ValueError 由 router 轉成 HTTP 狀態碼。
"""

from sqlalchemy import delete, func, insert, select, update

from config import settings
from crypto import hash_password, verify_password
from db.engine import engine
from db.tables import (
    chat_messages,
    clip_practices,
    clips,
    llm_providers,
    phrase_practices,
    phrases,
    transcript_segments,
    users,
    videos,
)

# 對外回傳的欄位（永不含 password_hash）
_PUBLIC = (
    users.c.id,
    users.c.username,
    users.c.role,
    users.c.is_active,
    users.c.created_at,
)


def _row(row) -> dict | None:
    return dict(row._mapping) if row is not None else None


# ── 查詢 ────────────────────────────────────────────────
def get_user(user_id: int) -> dict | None:
    with engine.connect() as conn:
        return _row(conn.execute(select(*_PUBLIC).where(users.c.id == user_id)).first())


def get_user_by_username(username: str) -> dict | None:
    """含 password_hash，僅供登入驗證使用。"""
    with engine.connect() as conn:
        return _row(
            conn.execute(select(users).where(users.c.username == username)).first()
        )


def list_users() -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(select(*_PUBLIC).order_by(users.c.created_at))
        return [dict(r._mapping) for r in rows]


def count_admins(exclude_user_id: int | None = None) -> int:
    stmt = select(func.count()).select_from(users).where(
        users.c.role == "admin", users.c.is_active.is_(True)
    )
    if exclude_user_id is not None:
        stmt = stmt.where(users.c.id != exclude_user_id)
    with engine.connect() as conn:
        return conn.execute(stmt).scalar_one()


# ── 建立 / 驗證 ─────────────────────────────────────────
def create_user(username: str, password: str, role: str = "user") -> dict:
    username = username.strip()
    if not username:
        raise ValueError("帳號不可空白")
    if len(username) > 64:
        raise ValueError("帳號長度不可超過 64 字元")
    if len(password) < 4:
        raise ValueError("密碼至少 4 個字元")
    if role not in ("admin", "user"):
        raise ValueError(f"未知的角色：{role}")
    if get_user_by_username(username) is not None:
        raise ValueError("此帳號已被註冊")

    with engine.begin() as conn:
        result = conn.execute(
            insert(users).values(
                username=username,
                password_hash=hash_password(password),
                role=role,
                is_active=True,
            )
        )
        user_id = result.inserted_primary_key[0]
    return get_user(user_id)


def authenticate(username: str, password: str) -> dict:
    """成功回公開欄位；失敗丟 ValueError。"""
    user = get_user_by_username(username.strip())
    if user is None or not verify_password(password, user["password_hash"]):
        raise ValueError("帳號或密碼錯誤")
    if not user["is_active"]:
        raise ValueError("此帳號已被停用")
    return {k: v for k, v in user.items() if k != "password_hash"}


# ── 修改 ────────────────────────────────────────────────
def change_password(user_id: int, new_password: str) -> None:
    if len(new_password) < 4:
        raise ValueError("密碼至少 4 個字元")
    with engine.begin() as conn:
        conn.execute(
            update(users)
            .where(users.c.id == user_id)
            .values(password_hash=hash_password(new_password))
        )


def set_active(user_id: int, is_active: bool) -> dict:
    if not is_active and count_admins(exclude_user_id=user_id) == 0:
        raise ValueError("不能停用最後一位管理員")
    with engine.begin() as conn:
        conn.execute(update(users).where(users.c.id == user_id).values(is_active=is_active))
    return get_user(user_id)


def set_role(user_id: int, role: str) -> dict:
    if role not in ("admin", "user"):
        raise ValueError(f"未知的角色：{role}")
    if role != "admin" and count_admins(exclude_user_id=user_id) == 0:
        raise ValueError("不能移除最後一位管理員的權限")
    with engine.begin() as conn:
        conn.execute(update(users).where(users.c.id == user_id).values(role=role))
    return get_user(user_id)


def delete_user(user_id: int) -> None:
    """連同該使用者的所有學習資料一併刪除（無 ON DELETE CASCADE，手動依序刪）。"""
    if count_admins(exclude_user_id=user_id) == 0:
        raise ValueError("不能刪除最後一位管理員")

    with engine.begin() as conn:
        video_ids = [
            r[0] for r in conn.execute(select(videos.c.id).where(videos.c.user_id == user_id))
        ]
        # 子表先刪，再刪父表
        conn.execute(delete(clip_practices).where(clip_practices.c.user_id == user_id))
        conn.execute(delete(clips).where(clips.c.user_id == user_id))
        conn.execute(delete(phrase_practices).where(phrase_practices.c.user_id == user_id))
        conn.execute(delete(phrases).where(phrases.c.user_id == user_id))
        conn.execute(delete(chat_messages).where(chat_messages.c.user_id == user_id))
        if video_ids:
            conn.execute(
                delete(transcript_segments).where(
                    transcript_segments.c.video_id.in_(video_ids)
                )
            )
        conn.execute(delete(videos).where(videos.c.user_id == user_id))
        conn.execute(delete(llm_providers).where(llm_providers.c.user_id == user_id))
        conn.execute(delete(users).where(users.c.id == user_id))


# ── 啟動時 seed ─────────────────────────────────────────
def ensure_admin_seed() -> None:
    """建立預設管理員（已存在則不動，不會覆蓋你改過的密碼）。"""
    if get_user_by_username(settings.admin_username) is not None:
        return
    create_user(settings.admin_username, settings.admin_password, role="admin")
    print(
        f"[seed] 已建立預設管理員 {settings.admin_username}/{settings.admin_password}"
        "，請登入後盡快改密碼。"
    )
