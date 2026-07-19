"""聽力例句（AB 擷取）。掛載後路徑為 /api/clips*。聽寫練習與批改在階段 4。"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from security import get_current_user
from services import clip_service, srs_service

router = APIRouter(prefix="/clips", tags=["clips"])


class ClipIn(BaseModel):
    video_id: int
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    label: str | None = None
    text: str | None = None  # 留空會自動從文字稿抓快照
    note: str | None = None


class ClipUpdateIn(BaseModel):
    label: str | None = None
    text: str | None = None
    note: str | None = None


class DictationIn(BaseModel):
    input_text: str = Field(min_length=1, max_length=2000)


class ReviewIn(BaseModel):
    quality: str = Field(description=" / ".join(srs_service.QUALITIES))


@router.get("")
def list_clips(video_id: int | None = None, user: dict = Depends(get_current_user)):
    return clip_service.list_clips(user["id"], video_id)


@router.get("/{clip_id}")
def get_clip(clip_id: int, user: dict = Depends(get_current_user)):
    clip = clip_service.get_clip(user["id"], clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="找不到這個例句")
    return clip


@router.post("", status_code=201)
def create_clip(body: ClipIn, tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    try:
        clip = clip_service.create_clip(
            user["id"],
            video_id=body.video_id,
            start_ms=body.start_ms,
            end_ms=body.end_ms,
            label=body.label,
            text=body.text,
            note=body.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 中文對照丟背景做，不要讓存例句這個動作等 LLM
    if clip["text"]:
        tasks.add_task(clip_service.translate_quietly, user["id"], clip["id"])
    return clip


@router.post("/{clip_id}/translate")
def translate(clip_id: int, force: bool = False, user: dict = Depends(get_current_user)):
    """產生中文對照（已經翻過就直接回傳，force=true 重翻）。"""
    try:
        return clip_service.translate_clip(user["id"], clip_id, force=force)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{clip_id}")
def update_clip(clip_id: int, body: ClipUpdateIn, user: dict = Depends(get_current_user)):
    try:
        return clip_service.update_clip(
            user["id"], clip_id, label=body.label, text=body.text, note=body.note
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{clip_id}", status_code=204)
def delete_clip(clip_id: int, user: dict = Depends(get_current_user)):
    try:
        clip_service.delete_clip(user["id"], clip_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{clip_id}/practices")
def list_practices(clip_id: int, user: dict = Depends(get_current_user)):
    try:
        return clip_service.list_practices(user["id"], clip_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{clip_id}/dictation")
def dictation(clip_id: int, body: DictationIn, user: dict = Depends(get_current_user)):
    """聽寫批改：difflib 算正確率 + LLM 解釋為什麼聽錯。"""
    try:
        return clip_service.dictation(user["id"], clip_id, body.input_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{clip_id}/review")
def review(clip_id: int, body: ReviewIn, user: dict = Depends(get_current_user)):
    """跟讀後自評，只更新複習排程。"""
    try:
        return clip_service.review(user["id"], clip_id, body.quality)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
