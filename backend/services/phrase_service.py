"""片語的收藏、解析、造句批改與複習排程。

AI 的部分委託 agents/（phrase_extractor、phrase_coach），
這裡只負責取資料、寫資料與錯誤處理。
"""

from sqlalchemy import delete, func, insert, select, update

from agents import phrase_coach, phrase_extractor
from db.engine import engine
from db.tables import phrase_practices, phrases, transcript_segments, videos
from services import srs_service


def _row(row) -> dict | None:
    return dict(row._mapping) if row is not None else None


# ── 查詢 ────────────────────────────────────────────────
def list_phrases(user_id: int, video_id: int | None = None) -> list[dict]:
    stmt = (
        select(phrases, videos.c.title.label("video_title"))
        .select_from(phrases)
        .outerjoin(videos, videos.c.id == phrases.c.video_id)
        .where(phrases.c.user_id == user_id)
        .order_by(phrases.c.created_at.desc())
    )
    if video_id is not None:
        stmt = stmt.where(phrases.c.video_id == video_id)
    with engine.connect() as conn:
        return [dict(r._mapping) for r in conn.execute(stmt)]


def get_phrase(user_id: int, phrase_id: int) -> dict | None:
    with engine.connect() as conn:
        return _row(
            conn.execute(
                select(phrases).where(phrases.c.id == phrase_id, phrases.c.user_id == user_id)
            ).first()
        )


def list_practices(user_id: int, phrase_id: int) -> list[dict]:
    if get_phrase(user_id, phrase_id) is None:
        raise ValueError("找不到這個片語")
    with engine.connect() as conn:
        rows = conn.execute(
            select(phrase_practices)
            .where(phrase_practices.c.phrase_id == phrase_id)
            .order_by(phrase_practices.c.created_at.desc())
        )
        return [dict(r._mapping) for r in rows]


# ── 萃取（不直接存，交給使用者挑）──
def extract_candidates(user_id: int, video_id: int) -> list[dict]:
    with engine.connect() as conn:
        owns = conn.execute(
            select(videos.c.id).where(videos.c.id == video_id, videos.c.user_id == user_id)
        ).first()
        if owns is None:
            raise ValueError("找不到這支影片")

        segments = conn.execute(
            select(transcript_segments.c.text)
            .where(transcript_segments.c.video_id == video_id)
            .order_by(transcript_segments.c.idx)
        )
        transcript = " ".join(r[0] for r in segments).strip()

    if not transcript:
        raise ValueError("這支影片還沒有文字稿")

    existing = [p["text"] for p in list_phrases(user_id)]
    return phrase_extractor.extract_phrases(user_id, transcript, existing)


# ── 收藏 ────────────────────────────────────────────────
def _find_context(video_id: int | None, text: str) -> tuple[int | None, str]:
    """找出片語出現在哪一句，當作解析時的上下文。"""
    if video_id is None:
        return None, ""
    with engine.connect() as conn:
        rows = conn.execute(
            select(transcript_segments.c.id, transcript_segments.c.text)
            .where(transcript_segments.c.video_id == video_id)
            .order_by(transcript_segments.c.idx)
        )
        needle = text.strip().lower()
        for segment_id, segment_text in rows:
            if needle in segment_text.lower():
                return segment_id, segment_text
    return None, ""


def create_phrase(
    user_id: int,
    text: str,
    video_id: int | None = None,
    meaning: str | None = None,
    difficulty: str | None = None,
    explain: bool = True,
) -> dict:
    """收藏片語。explain=True 時同步請 agent 產生解析（會多花幾秒）。"""
    text = text.strip()
    if not text:
        raise ValueError("片語不可空白")
    if len(text) > 300:
        raise ValueError("片語太長了（上限 300 字元）")

    with engine.connect() as conn:
        duplicate = conn.execute(
            select(phrases.c.id).where(
                phrases.c.user_id == user_id, func.lower(phrases.c.text) == text.lower()
            )
        ).first()
    if duplicate is not None:
        raise ValueError("這個片語已經在你的片語庫了")

    segment_id, context = _find_context(video_id, text)

    values = {
        "user_id": user_id,
        "video_id": video_id,
        "segment_id": segment_id,
        "text": text,
        "meaning": meaning,
        "difficulty": difficulty,
    }

    if explain:
        detail = phrase_coach.explain_phrase(user_id, text, context)
        values.update(
            meaning=detail.get("meaning") or meaning,
            explanation=detail.get("explanation"),
            examples_json=detail.get("examples"),
            paraphrases_json=detail.get("paraphrases"),
        )

    with engine.begin() as conn:
        result = conn.execute(insert(phrases).values(**values))
        new_id = result.inserted_primary_key[0]
    return get_phrase(user_id, new_id)


def explain_phrase(user_id: int, phrase_id: int) -> dict:
    """重新產生（或補上）解析。"""
    phrase = get_phrase(user_id, phrase_id)
    if phrase is None:
        raise ValueError("找不到這個片語")

    _, context = _find_context(phrase["video_id"], phrase["text"])
    detail = phrase_coach.explain_phrase(user_id, phrase["text"], context)

    with engine.begin() as conn:
        conn.execute(
            update(phrases)
            .where(phrases.c.id == phrase_id)
            .values(
                meaning=detail.get("meaning"),
                explanation=detail.get("explanation"),
                examples_json=detail.get("examples"),
                paraphrases_json=detail.get("paraphrases"),
            )
        )
    return get_phrase(user_id, phrase_id)


def delete_phrase(user_id: int, phrase_id: int) -> None:
    if get_phrase(user_id, phrase_id) is None:
        raise ValueError("找不到這個片語")
    with engine.begin() as conn:
        conn.execute(delete(phrase_practices).where(phrase_practices.c.phrase_id == phrase_id))
        conn.execute(delete(phrases).where(phrases.c.id == phrase_id))


# ── 造句批改 ────────────────────────────────────────────
def practice(user_id: int, phrase_id: int, sentence: str) -> dict:
    """批改造樣造句，寫入紀錄並依結果更新複習排程。"""
    phrase = get_phrase(user_id, phrase_id)
    if phrase is None:
        raise ValueError("找不到這個片語")
    sentence = sentence.strip()
    if not sentence:
        raise ValueError("請先寫一個句子")

    grading = phrase_coach.grade_sentence(user_id, phrase["text"], sentence)

    # 對了就照 good 推進，錯了就當天再練
    schedule = srs_service.next_schedule(
        phrase["ease"],
        phrase["interval_days"],
        phrase["review_count"],
        "good" if grading.get("is_correct") else "again",
    )

    with engine.begin() as conn:
        result = conn.execute(
            insert(phrase_practices).values(
                phrase_id=phrase_id,
                user_id=user_id,
                user_sentence=sentence,
                is_correct=bool(grading.get("is_correct")),
                correction=grading.get("correction"),
                feedback=grading.get("feedback"),
            )
        )
        practice_id = result.inserted_primary_key[0]
        conn.execute(update(phrases).where(phrases.c.id == phrase_id).values(**schedule))

    return {
        "id": practice_id,
        "phrase_id": phrase_id,
        "user_sentence": sentence,
        "is_correct": bool(grading.get("is_correct")),
        "correction": grading.get("correction"),
        "feedback": grading.get("feedback"),
    }


def review(user_id: int, phrase_id: int, quality: str) -> dict:
    """純自評複習（不造句），只更新排程。"""
    phrase = get_phrase(user_id, phrase_id)
    if phrase is None:
        raise ValueError("找不到這個片語")

    schedule = srs_service.next_schedule(
        phrase["ease"], phrase["interval_days"], phrase["review_count"], quality
    )
    with engine.begin() as conn:
        conn.execute(update(phrases).where(phrases.c.id == phrase_id).values(**schedule))
    return get_phrase(user_id, phrase_id)
