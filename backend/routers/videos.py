"""影片匯入與文字稿。掛載後路徑為 /api/videos*。

文字稿擷取可能要數秒（字幕）到數分鐘（Whisper），所以丟 BackgroundTasks 執行，
前端靠輪詢 transcript_status 顯示進度（pending / ready / failed）。
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from security import get_current_user
from services import transcript_service, video_service

router = APIRouter(prefix="/videos", tags=["videos"])


class ImportIn(BaseModel):
    url: str = Field(min_length=1, max_length=500)


class ManualTranscriptIn(BaseModel):
    text: str = Field(min_length=1, max_length=500_000)


@router.get("")
def list_videos(user: dict = Depends(get_current_user)):
    return video_service.list_videos(user["id"])


@router.post("", status_code=201)
def import_video(body: ImportIn, tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    try:
        video = video_service.create_video(user["id"], body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    tasks.add_task(transcript_service.ingest, video["id"], video["youtube_id"], user["id"])
    return video


@router.get("/{video_id}")
def get_video(video_id: int, user: dict = Depends(get_current_user)):
    video = video_service.get_video(user["id"], video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="找不到這支影片")
    return video


@router.get("/{video_id}/segments")
def get_segments(video_id: int, user: dict = Depends(get_current_user)):
    try:
        return video_service.get_segments(user["id"], video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{video_id}/retry")
def retry_transcript(
    video_id: int, tasks: BackgroundTasks, user: dict = Depends(get_current_user)
):
    try:
        video = video_service.mark_pending(user["id"], video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    tasks.add_task(transcript_service.ingest, video["id"], video["youtube_id"], user["id"])
    return video


@router.post("/{video_id}/transcript")
def set_manual_transcript(
    video_id: int, body: ManualTranscriptIn, user: dict = Depends(get_current_user)
):
    """手動貼上字幕（SRT / VTT / YouTube 轉錄稿面板的格式都吃）。

    雲端主機的 IP 常被 YouTube 封鎖，這是不必付費代理也能用的退路。
    """
    video = video_service.get_video(user["id"], video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="找不到這支影片")

    try:
        count = transcript_service.ingest_manual(video_id, body.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {**video_service.get_video(user["id"], video_id), "segment_count": count}


@router.post("/{video_id}/resegment")
def resegment(video_id: int, user: dict = Depends(get_current_user)):
    """用 LLM 補標點並重新斷句（自動字幕沒有標點，斷句常常怪怪的）。"""
    if video_service.get_video(user["id"], video_id) is None:
        raise HTTPException(status_code=404, detail="找不到這支影片")
    try:
        count = transcript_service.resegment_with_llm(user["id"], video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"segment_count": count}


@router.delete("/{video_id}", status_code=204)
def delete_video(video_id: int, user: dict = Depends(get_current_user)):
    try:
        video_service.delete_video(user["id"], video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
