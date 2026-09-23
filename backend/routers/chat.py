"""Tutor 問答。掛載後路徑為 /api/chat*。

前端用 POST /api/chat/stream（SSE 串流）；POST /api/chat 是一次回完整答案的舊版，保留給非串流用途。
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from security import get_current_user
from services import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


class AskIn(BaseModel):
    thread_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=1, max_length=2000)
    video_id: int | None = None
    context: str | None = None  # 使用者反白的文字稿片段


@router.get("")
def list_messages(thread_id: str, user: dict = Depends(get_current_user)):
    return chat_service.list_messages(user["id"], thread_id)


@router.delete("", status_code=204)
def clear_thread(thread_id: str, user: dict = Depends(get_current_user)):
    chat_service.clear_thread(user["id"], thread_id)


@router.post("")
def ask(body: AskIn, user: dict = Depends(get_current_user)):
    try:
        return chat_service.ask(
            user["id"],
            thread_id=body.thread_id,
            question=body.question,
            video_id=body.video_id,
            context=body.context or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/stream")
def ask_stream(body: AskIn, user: dict = Depends(get_current_user)):
    """SSE：每個事件一行 `data: {json}`，type 為 status / delta / error / done。

    用 POST 而不是 EventSource（它只能 GET、不能帶 Authorization header），
    前端以 fetch 讀 ReadableStream（見 frontend-backend-integration.md §5）。
    """
    try:
        events = chat_service.ask_stream(
            user["id"],
            thread_id=body.thread_id,
            question=body.question,
            video_id=body.video_id,
            context=body.context or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    def sse():
        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        # X-Accel-Buffering：叫 nginx 別把串流整段緩衝起來（內網版走 nginx 反代）
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
