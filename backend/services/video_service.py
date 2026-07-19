"""影片匯入與查詢。文字稿的實際擷取在 transcript_service（背景執行）。"""

from sqlalchemy import delete, func, insert, select, update

from db.engine import engine
from db.tables import (
    chat_messages,
    clip_practices,
    clips,
    phrase_practices,
    phrases,
    transcript_segments,
    videos,
)
from services import youtube_service


def _row(row) -> dict | None:
    return dict(row._mapping) if row is not None else None


def list_videos(user_id: int) -> list[dict]:
    """列表附上各影片的句數與已擷取例句數，前端不必再逐支查。"""
    segment_count = (
        select(transcript_segments.c.video_id, func.count().label("segment_count"))
        .group_by(transcript_segments.c.video_id)
        .subquery()
    )
    clip_count = (
        select(clips.c.video_id, func.count().label("clip_count"))
        .group_by(clips.c.video_id)
        .subquery()
    )

    stmt = (
        select(
            videos,
            func.coalesce(segment_count.c.segment_count, 0).label("segment_count"),
            func.coalesce(clip_count.c.clip_count, 0).label("clip_count"),
        )
        .select_from(videos)
        .outerjoin(segment_count, segment_count.c.video_id == videos.c.id)
        .outerjoin(clip_count, clip_count.c.video_id == videos.c.id)
        .where(videos.c.user_id == user_id)
        .order_by(videos.c.created_at.desc())
    )
    with engine.connect() as conn:
        return [dict(r._mapping) for r in conn.execute(stmt)]


def get_video(user_id: int, video_id: int) -> dict | None:
    with engine.connect() as conn:
        return _row(
            conn.execute(
                select(videos).where(videos.c.id == video_id, videos.c.user_id == user_id)
            ).first()
        )


def get_segments(user_id: int, video_id: int) -> list[dict]:
    if get_video(user_id, video_id) is None:
        raise ValueError("找不到這支影片")
    with engine.connect() as conn:
        rows = conn.execute(
            select(transcript_segments)
            .where(transcript_segments.c.video_id == video_id)
            .order_by(transcript_segments.c.idx)
        )
        return [dict(r._mapping) for r in rows]


def create_video(user_id: int, url: str) -> dict:
    """建立影片紀錄（status=pending）；文字稿由呼叫端丟到背景工作去抓。"""
    youtube_id = youtube_service.extract_video_id(url)

    with engine.connect() as conn:
        existing = conn.execute(
            select(videos).where(videos.c.user_id == user_id, videos.c.youtube_id == youtube_id)
        ).first()
    if existing is not None:
        raise ValueError("這支影片你已經匯入過了")

    meta = youtube_service.fetch_metadata(youtube_id)
    with engine.begin() as conn:
        result = conn.execute(
            insert(videos).values(
                user_id=user_id,
                youtube_id=youtube_id,
                title=meta.get("title") or youtube_id,
                channel=meta.get("channel"),
                thumbnail_url=meta.get("thumbnail_url"),
                transcript_status="pending",
            )
        )
        new_id = result.inserted_primary_key[0]
    return get_video(user_id, new_id)


def mark_pending(user_id: int, video_id: int) -> dict:
    """重試前把狀態打回 pending，讓前端的輪詢重新轉起來。"""
    if get_video(user_id, video_id) is None:
        raise ValueError("找不到這支影片")
    with engine.begin() as conn:
        conn.execute(
            update(videos)
            .where(videos.c.id == video_id)
            .values(transcript_status="pending", error_message=None)
        )
    return get_video(user_id, video_id)


def delete_video(user_id: int, video_id: int) -> None:
    """連同文字稿、例句、片語、問答紀錄一起刪。"""
    if get_video(user_id, video_id) is None:
        raise ValueError("找不到這支影片")

    with engine.begin() as conn:
        clip_ids = [r[0] for r in conn.execute(select(clips.c.id).where(clips.c.video_id == video_id))]
        if clip_ids:
            conn.execute(delete(clip_practices).where(clip_practices.c.clip_id.in_(clip_ids)))
        conn.execute(delete(clips).where(clips.c.video_id == video_id))

        phrase_ids = [
            r[0] for r in conn.execute(select(phrases.c.id).where(phrases.c.video_id == video_id))
        ]
        if phrase_ids:
            conn.execute(delete(phrase_practices).where(phrase_practices.c.phrase_id.in_(phrase_ids)))
        conn.execute(delete(phrases).where(phrases.c.video_id == video_id))
        conn.execute(delete(chat_messages).where(chat_messages.c.video_id == video_id))
        conn.execute(delete(transcript_segments).where(transcript_segments.c.video_id == video_id))
        conn.execute(delete(videos).where(videos.c.id == video_id))
