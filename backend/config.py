"""集中設定：程式各處只 import `settings`，不散落 os.getenv。

見 reference/backend/backend-conventions.md §5。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"  # dev / prod

    # 資料庫（見 database.md）：初期 sqlite，換 postgres 只改這行
    database_url: str = "sqlite:///./data/app.db"

    # ── 帳號 / JWT ──
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 天

    # 啟動時自動建立的管理員帳號（已存在則不動）
    admin_username: str = "admin"
    admin_password: str = "admin"

    # 開放自由註冊；關掉後只有管理員能建帳號
    allow_registration: bool = True

    # ── 加密 ──
    # LLM provider 的 api_key 用 Fernet 加密存 DB。留空則從 jwt_secret 推導，
    # 正式環境請自行產一組固定值（見 backend/.env.example）。
    encryption_key: str = ""


settings = Settings()
