"""Tutor 問答。掛載後路徑為 /api/chat*。"""

from fastapi import APIRouter, Depends, HTTPException
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
