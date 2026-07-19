"""yt-learn 後端進入點。

慣例（backend-conventions.md §3）：
  - 所有路由統一前綴 /api
  - host 0.0.0.0 / port 8000 寫死，對外埠交給 docker-compose
  - 直接 `python api.py` 就能跑
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db.engine import engine
from db.migrate import add_missing_columns
from db.tables import metadata
from routers import (
    admin_users,
    auth,
    chat,
    clips,
    phrases,
    settings as settings_router,
    tts,
    videos,
)
from services import user_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 開發期用 create_all + 補欄位；正式改結構時改走 Alembic（database.md §7）
    metadata.create_all(engine)
    add_missing_columns()
    user_service.ensure_admin_seed()
    yield


app = FastAPI(title="lang-learn", version="0.1.0", lifespan=lifespan)

# 開發期放寬；正式期前端走 nginx 同源反代，其實不需要 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(videos.router, prefix="/api")
app.include_router(clips.router, prefix="/api")
app.include_router(phrases.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(tts.router, prefix="/api")
app.include_router(admin_users.router, prefix="/api")


# ── 前端靜態檔（單一容器部署用，例如 Cloud Run）──
# 只有在 build 時把前端 dist 複製進 backend/static 才會生效；
# 本機開發沒有這個目錄，前端仍走 Vite dev server + proxy，行為不變。
# 見 DEPLOY-CLOUDRUN.md。
_STATIC_DIR = Path(__file__).parent / "static"

if _STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """SPA fallback：實體檔就回檔案，其餘一律回 index.html 交給前端路由。

        這個 catch-all 註冊在所有 /api 路由之後，所以不會蓋掉 API。
        """
        candidate = _STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
