"""間隔重複排程（SM-2 精簡版），phrases 與 clips 共用。

回傳的是「新的 SRS 欄位值」，實際寫入交給各自的 service，
這樣兩張表雖然分開，複習節奏的規則只有一份。
"""

from datetime import datetime, timedelta, timezone

# 使用者對一次複習的自評
QUALITIES = ("again", "hard", "good", "easy")

_MIN_EASE = 1.3
_MAX_EASE = 3.0


def next_schedule(ease: float, interval_days: int, review_count: int, quality: str) -> dict:
    """算出下一次複習時間。quality 見 QUALITIES。"""
    if quality not in QUALITIES:
        raise ValueError(f"未知的評分：{quality}（可用：{', '.join(QUALITIES)}）")

    if quality == "again":
        # 沒答對就當天再來一次，並把 ease 調低
        ease -= 0.20
        interval = 0
    elif quality == "hard":
        ease -= 0.15
        interval = max(1, round(interval_days * 1.2)) if interval_days else 1
    elif quality == "good":
        interval = 1 if interval_days == 0 else round(interval_days * ease)
    else:  # easy
        ease += 0.15
        interval = 3 if interval_days == 0 else round(interval_days * ease * 1.3)

    ease = max(_MIN_EASE, min(_MAX_EASE, ease))
    # interval=0 代表當天再練，給 10 分鐘後
    due = datetime.now(timezone.utc) + (
        timedelta(minutes=10) if interval == 0 else timedelta(days=interval)
    )

    return {
        "ease": round(ease, 2),
        "interval_days": interval,
        "due_at": due,
        "review_count": review_count + 1,
    }


def quality_from_accuracy(accuracy: float) -> str:
    """聽寫的正確率自動換算成評分，使用者不必每次自評。"""
    if accuracy >= 0.95:
        return "easy"
    if accuracy >= 0.85:
        return "good"
    if accuracy >= 0.60:
        return "hard"
    return "again"
