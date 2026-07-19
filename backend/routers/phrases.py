"""片語庫。掛載後路徑為 /api/phrases*。

會呼叫 LLM 的端點（萃取 / 解析 / 批改）都可能跑好幾秒，
沒設定 provider 時 service 會丟 ValueError，這裡統一轉成 400 提示去設定頁。
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from security import get_current_user
from services import phrase_service, srs_service

router = APIRouter(prefix="/phrases", tags=["phrases"])


class ExtractIn(BaseModel):
    video_id: int


class PhraseIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    video_id: int | None = None
    meaning: str | None = None
    difficulty: str | None = None
    explain: bool = True  # 收藏時是否同步產生解析


class PracticeIn(BaseModel):
    sentence: str = Field(min_length=1, max_length=1000)


class ReviewIn(BaseModel):
    quality: str = Field(description=" / ".join(srs_service.QUALITIES))


@router.get("")
def list_phrases(video_id: int | None = None, user: dict = Depends(get_current_user)):
    return phrase_service.list_phrases(user["id"], video_id)


@router.post("/extract")
def extract(body: ExtractIn, user: dict = Depends(get_current_user)):
    """從影片文字稿萃取候選片語（不直接存，由使用者挑選後再收藏）。"""
    try:
        return phrase_service.extract_candidates(user["id"], body.video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("", status_code=201)
def create_phrase(body: PhraseIn, user: dict = Depends(get_current_user)):
    try:
        return phrase_service.create_phrase(
            user["id"],
            text=body.text,
            video_id=body.video_id,
            meaning=body.meaning,
            difficulty=body.difficulty,
            explain=body.explain,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{phrase_id}/explain")
def explain(phrase_id: int, user: dict = Depends(get_current_user)):
    try:
        return phrase_service.explain_phrase(user["id"], phrase_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{phrase_id}/practices")
def list_practices(phrase_id: int, user: dict = Depends(get_current_user)):
    try:
        return phrase_service.list_practices(user["id"], phrase_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{phrase_id}/practice")
def practice(phrase_id: int, body: PracticeIn, user: dict = Depends(get_current_user)):
    try:
        return phrase_service.practice(user["id"], phrase_id, body.sentence)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{phrase_id}/review")
def review(phrase_id: int, body: ReviewIn, user: dict = Depends(get_current_user)):
    try:
        return phrase_service.review(user["id"], phrase_id, body.quality)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{phrase_id}", status_code=204)
def delete_phrase(phrase_id: int, user: dict = Depends(get_current_user)):
    try:
        phrase_service.delete_phrase(user["id"], phrase_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
