"""影片匯入與查詢。

兩種來源：
  YouTube  只建紀錄（pending），文字稿由使用者手動貼上，見 transcript_service
  BBC      網頁上有音檔與文字稿，匯入時一次做完（Whisper 對時間軸），直接 ready
"""

from sqlalchemy import delete, insert, select

from db.engine import engine
from db.tables import (
    chat_messages,
    clip_practices,
    clips,
    phrase_practices,
    phrases,
    transcript_fragments,
    transcript_segments,
    videos,
)
from services import bbc_service, transcript_service, youtube_service


def _row(row) -> dict | None:
    return dict(row._mapping) if row is not None else None


def list_videos(user_id: int) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            select(videos)
            .where(videos.c.user_id == user_id)
            .order_by(videos.c.created_at.desc())
        )
        return [dict(r._mapping) for r in rows]


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


def _ensure_not_imported(user_id: int, key: str) -> None:
    with engine.connect() as conn:
        existing = conn.execute(
            select(videos.c.id).where(videos.c.user_id == user_id, videos.c.youtube_id == key)
        ).first()
    if existing is not None:
        raise ValueError("這支影片（或這一集）你已經匯入過了")


def create_video(user_id: int, url: str) -> dict:
    """依網址分流：BBC 一次匯入完成；YouTube 建紀錄（status=pending）等使用者貼字幕。"""
    if bbc_service.is_bbc_url(url):
        return _create_bbc_episode(user_id, url)

    youtube_id = youtube_service.extract_video_id(url)
    _ensure_not_imported(user_id, youtube_id)

    meta = youtube_service.fetch_metadata(youtube_id)
    with engine.begin() as conn:
        result = conn.execute(
            insert(videos).values(
                user_id=user_id,
                youtube_id=youtube_id,
                title=meta.get("title") or youtube_id,
                channel=meta.get("channel"),
                thumbnail_url=meta.get("thumbnail_url"),
                source="youtube",
                page_url=f"https://www.youtube.com/watch?v={youtube_id}",
                transcript_status="pending",
            )
        )
        new_id = result.inserted_primary_key[0]
    return get_video(user_id, new_id)


def _create_bbc_episode(user_id: int, url: str) -> dict:
    """抓網頁 → Whisper 取字級時間 → 對上官方文字稿 → 存檔。

    全部成功才寫 DB：任何一步失敗都不留下半套的紀錄，使用者重貼網址即可重試。
    音檔不存，前端直接播 BBC 的 mp3（media_url）。
    """
    from llm import transcribe_words  # 和 transcript_service 一樣，用到才載入 LLM 相關套件

    key = bbc_service.source_key(url)
    _ensure_not_imported(user_id, key)

    episode = bbc_service.fetch_episode(url)
    speech = transcribe_words(user_id, episode["audio"])
    if not speech["words"]:
        raise ValueError("Whisper 沒有辨識出任何字，無法對時間軸")
    segments = transcript_service.align_known_text(
        episode["sentences"], speech["words"], speech["duration_ms"]
    )

    with engine.begin() as conn:
        result = conn.execute(
            insert(videos).values(
                user_id=user_id,
                youtube_id=key,
                source="bbc",
                media_url=episode["audio_url"],
                page_url=url.strip(),
                title=episode["title"] or key,
                channel="BBC Learning English",
                thumbnail_url=episode["thumbnail_url"],
                duration_sec=speech["duration_ms"] // 1000 or None,
                transcript_status="pending",
            )
        )
        new_id = result.inserted_primary_key[0]

    transcript_service.ingest_aligned(new_id, segments, source="bbc")
    return get_video(user_id, new_id)


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
        conn.execute(delete(transcript_fragments).where(transcript_fragments.c.video_id == video_id))
        conn.execute(delete(videos).where(videos.c.id == video_id))
