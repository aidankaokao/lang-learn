"""聽力例句（AB 擷取的段落）。

因為走 YouTube IFrame、不下載音訊，一筆 clip 存的是「座標 + 文字快照」：
video_id + start_ms/end_ms 供播放器循環，text 供聽寫比對（影片消失時至少文字還在）。
與 phrases 共用同一組 SRS 欄位，由 study_planner 統一排複習（階段 4）。
"""

from sqlalchemy import delete, insert, select, update

from db.engine import engine
from db.tables import clip_practices, clips, transcript_segments, videos
from services import srs_service

# 太短聽不出東西、太長不利於聽寫，給個合理範圍
_MIN_DURATION_MS = 500
_MAX_DURATION_MS = 120_000


def _row(row) -> dict | None:
    return dict(row._mapping) if row is not None else None


def _snapshot_text(video_id: int, start_ms: int, end_ms: int) -> str:
    """取這段時間內的文字稿句子，合併成文字快照。

    段落時間可能互相重疊（自動字幕常見），只要 overlap > 0 就算會把上一段的尾巴
    也抓進來，所以要求「重疊夠多」才納入。
    """
    with engine.connect() as conn:
        rows = conn.execute(
            select(
                transcript_segments.c.text,
                transcript_segments.c.start_ms,
                transcript_segments.c.end_ms,
            )
            .where(
                transcript_segments.c.video_id == video_id,
                transcript_segments.c.end_ms > start_ms,
                transcript_segments.c.start_ms < end_ms,
            )
            .order_by(transcript_segments.c.idx)
        )

        kept: list[str] = []
        for text, seg_start, seg_end in rows:
            overlap = min(seg_end, end_ms) - max(seg_start, start_ms)
            duration = max(1, seg_end - seg_start)
            if overlap >= min(500, duration * 0.5):
                kept.append(text)
        return " ".join(kept).strip()


def list_clips(user_id: int, video_id: int | None = None) -> list[dict]:
    stmt = (
        select(
            clips,
            videos.c.youtube_id,
            videos.c.title.label("video_title"),
        )
        .select_from(clips)
        .join(videos, videos.c.id == clips.c.video_id)
        .where(clips.c.user_id == user_id)
        .order_by(clips.c.created_at.desc())
    )
    if video_id is not None:
        stmt = stmt.where(clips.c.video_id == video_id)
    with engine.connect() as conn:
        return [dict(r._mapping) for r in conn.execute(stmt)]


def get_clip(user_id: int, clip_id: int) -> dict | None:
    with engine.connect() as conn:
        return _row(
            conn.execute(
                select(clips).where(clips.c.id == clip_id, clips.c.user_id == user_id)
            ).first()
        )


def create_clip(
    user_id: int,
    video_id: int,
    start_ms: int,
    end_ms: int,
    label: str | None = None,
    text: str | None = None,
    note: str | None = None,
) -> dict:
    with engine.connect() as conn:
        owns_video = conn.execute(
            select(videos.c.id).where(videos.c.id == video_id, videos.c.user_id == user_id)
        ).first()
    if owns_video is None:
        raise ValueError("找不到這支影片")

    if end_ms - start_ms < _MIN_DURATION_MS:
        raise ValueError("段落太短了，至少要 0.5 秒")
    if end_ms - start_ms > _MAX_DURATION_MS:
        raise ValueError("段落太長了，最多 2 分鐘")

    # 沒指定文字就從文字稿抓快照；抓不到也允許（使用者可自己補）
    snapshot = (text or "").strip() or _snapshot_text(video_id, start_ms, end_ms)

    with engine.begin() as conn:
        result = conn.execute(
            insert(clips).values(
                user_id=user_id,
                video_id=video_id,
                start_ms=start_ms,
                end_ms=end_ms,
                label=(label or "").strip() or None,
                text=snapshot or None,
                note=(note or "").strip() or None,
            )
        )
        new_id = result.inserted_primary_key[0]
    return get_clip(user_id, new_id)


def update_clip(
    user_id: int,
    clip_id: int,
    label: str | None = None,
    text: str | None = None,
    note: str | None = None,
) -> dict:
    if get_clip(user_id, clip_id) is None:
        raise ValueError("找不到這個例句")

    values = {}
    if label is not None:
        values["label"] = label.strip() or None
    if text is not None:
        values["text"] = text.strip() or None
    if note is not None:
        values["note"] = note.strip() or None
    if not values:
        return get_clip(user_id, clip_id)

    with engine.begin() as conn:
        conn.execute(
            update(clips)
            .where(clips.c.id == clip_id, clips.c.user_id == user_id)
            .values(**values)
        )
    return get_clip(user_id, clip_id)


def delete_clip(user_id: int, clip_id: int) -> None:
    if get_clip(user_id, clip_id) is None:
        raise ValueError("找不到這個例句")
    with engine.begin() as conn:
        conn.execute(delete(clip_practices).where(clip_practices.c.clip_id == clip_id))
        conn.execute(delete(clips).where(clips.c.id == clip_id, clips.c.user_id == user_id))


# ── 中文對照 ────────────────────────────────────────────
_TRANSLATE_SYSTEM = """你是英翻中譯者，服務對象是台灣的英文學習者。

規則：
- 翻成**自然的繁體中文口語**，不要逐字直譯，也不要文謅謅。
- 保留原句的語氣（隨口說的就翻得隨口，正式的就翻得正式）。
- 只輸出譯文本身，不要加註解、不要重複英文原文、不要加引號。"""


def translate_clip(user_id: int, clip_id: int, force: bool = False) -> dict:
    """產生中文對照並存起來。已經翻過就直接回傳（除非 force）。"""
    from llm import get_chat_model

    clip = get_clip(user_id, clip_id)
    if clip is None:
        raise ValueError("找不到這個例句")
    if not clip["text"]:
        raise ValueError("這個例句沒有文字可以翻譯")
    if clip["translation"] and not force:
        return clip

    llm = get_chat_model(user_id)
    resp = llm.invoke([("system", _TRANSLATE_SYSTEM), ("human", clip["text"])])
    translation = str(resp.content).strip()

    with engine.begin() as conn:
        conn.execute(
            update(clips).where(clips.c.id == clip_id).values(translation=translation)
        )
    return get_clip(user_id, clip_id)


def translate_quietly(user_id: int, clip_id: int) -> None:
    """給背景工作用：失敗就算了，使用者之後可以在列表手動點翻譯。"""
    try:
        translate_clip(user_id, clip_id)
    except Exception as e:  # 沒設定 provider、額度用完、網路問題都不該讓存 clip 失敗
        print(f"[clip] 例句 {clip_id} 自動翻譯失敗：{type(e).__name__}: {e}")


# ── 練習 ────────────────────────────────────────────────
def list_practices(user_id: int, clip_id: int) -> list[dict]:
    if get_clip(user_id, clip_id) is None:
        raise ValueError("找不到這個例句")
    with engine.connect() as conn:
        rows = conn.execute(
            select(clip_practices)
            .where(clip_practices.c.clip_id == clip_id)
            .order_by(clip_practices.c.created_at.desc())
        )
        return [dict(r._mapping) for r in rows]


def dictation(user_id: int, clip_id: int, input_text: str) -> dict:
    """聽寫批改：difflib 比對 + LLM 解釋，並依正確率更新複習排程。"""
    from agents import dictation_coach  # 延遲 import，避免沒用到 AI 時載入 langchain

    clip = get_clip(user_id, clip_id)
    if clip is None:
        raise ValueError("找不到這個例句")
    if not clip["text"]:
        raise ValueError("這個例句沒有文字稿可以比對，請先在例句上補上文字")
    if not input_text.strip():
        raise ValueError("請先寫下你聽到的內容")

    result = dictation_coach.grade_dictation(user_id, clip["text"], input_text)
    diff = result["diff"]
    accuracy = diff["accuracy"]

    schedule = srs_service.next_schedule(
        clip["ease"],
        clip["interval_days"],
        clip["review_count"],
        srs_service.quality_from_accuracy(accuracy),
    )

    with engine.begin() as conn:
        inserted = conn.execute(
            insert(clip_practices).values(
                clip_id=clip_id,
                user_id=user_id,
                mode="dictation",
                input_text=input_text,
                accuracy=accuracy,
                diff_json=diff["ops"],
                feedback=result["feedback"],
            )
        )
        practice_id = inserted.inserted_primary_key[0]
        conn.execute(update(clips).where(clips.c.id == clip_id).values(**schedule))

    return {
        "id": practice_id,
        "clip_id": clip_id,
        "mode": "dictation",
        "input_text": input_text,
        "expected_text": clip["text"],
        "accuracy": accuracy,
        "diff_json": diff["ops"],
        "feedback": result["feedback"],
    }


def review(user_id: int, clip_id: int, quality: str) -> dict:
    """跟讀 / 自評複習，只更新排程。"""
    clip = get_clip(user_id, clip_id)
    if clip is None:
        raise ValueError("找不到這個例句")

    schedule = srs_service.next_schedule(
        clip["ease"], clip["interval_days"], clip["review_count"], quality
    )
    with engine.begin() as conn:
        conn.execute(update(clips).where(clips.c.id == clip_id).values(**schedule))
        conn.execute(
            insert(clip_practices).values(
                clip_id=clip_id, user_id=user_id, mode="shadowing", input_text=None
            )
        )
    return get_clip(user_id, clip_id)
