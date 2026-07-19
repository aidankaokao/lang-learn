"""SQLAlchemy Engine：唯一的 DB 差異處理集中處（見 database.md §3）。"""

from pathlib import Path

from sqlalchemy import create_engine

from config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

# SQLite 需要 check_same_thread=False 才能在多執行緒（FastAPI）用同一連線
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

if _is_sqlite:
    # sqlite:///./data/app.db -> ./data 需先存在，否則開檔失敗
    _db_path = Path(settings.database_url.split("///", 1)[-1])
    _db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,  # 連線失效自動重連（PostgreSQL 尤其需要）
    future=True,
)
