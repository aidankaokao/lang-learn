"""文字稿擷取：YouTube 英文字幕優先，抓不到才用 Whisper API 轉錄。

流程（背景執行，狀態寫回 videos.transcript_status）：
  1. youtube-transcript-api 抓英文字幕（含自動字幕）→ source="caption"
  2. 失敗 → yt-dlp 下載音訊 → OpenAI whisper-1 轉錄 → source="whisper"
  3. 兩者都失敗 → status="failed"，錯誤訊息寫進 videos.error_message

字幕原始片段很碎（2~5 秒一段），這裡會合併成接近句子的單位，
讓 AB 擷取與逐句對照好用得多（見 _merge_into_sentences）。
"""

import os
import tempfile
from pathlib import Path

from sqlalchemy import delete, insert, update

from db.engine import engine
from db.tables import transcript_segments, videos
from services import llm_provider_service

# 優先順序：手動英文字幕 > 各地區英文 > 自動英文
_LANGUAGES = ["en", "en-US", "en-GB", "en-CA", "en-AU"]

# Whisper API 單檔上限 25MB
_WHISPER_MAX_BYTES = 25 * 1024 * 1024

# 合併字幕片段時的上限：超過就斷句，避免整段黏成一大塊
_MAX_SEGMENT_MS = 12_000
_MAX_SEGMENT_CHARS = 220


# ── 字幕 ────────────────────────────────────────────────
def _fetch_captions(youtube_id: str) -> list[dict]:
    """回傳 [{text, start, duration}]（秒）。

    youtube-transcript-api 0.6.x 與 1.x 的 API 不同，這裡兩種都相容。
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    if hasattr(YouTubeTranscriptApi, "get_transcript"):  # 0.6.x：類別方法
        return YouTubeTranscriptApi.get_transcript(youtube_id, languages=_LANGUAGES)

    # 1.x：實例方法，回傳的是物件不是 dict
    fetched = YouTubeTranscriptApi().fetch(youtube_id, languages=_LANGUAGES)
    return [{"text": s.text, "start": s.start, "duration": s.duration} for s in fetched]


def _clean(text: str) -> str:
    # 字幕常見的換行與音效標記，留著會干擾閱讀與聽寫比對
    return " ".join(text.replace("\n", " ").split())


def _normalize_fragments(raw: list[dict]) -> list[dict]:
    """整理原始字幕片段，回傳 [{text, start, end}]（秒）。

    自動字幕是「滾動式」的：相鄰片段的時間區間會大幅重疊，而且常重複上一段的字。
    直接拿 start+duration 當結束時間，會讓段落的結尾往後飄好幾秒 —— 這是文字與聲音
    對不起來的主因。這裡做兩件事：
      1. 去掉與前一段完全重複的文字
      2. 把每段的結束時間夾到「下一段的開始」，消掉重疊
    """
    items: list[dict] = []
    for item in raw:
        text = _clean(item.get("text", ""))
        if not text:
            continue
        if items and items[-1]["text"] == text:  # 滾動字幕的重複
            continue
        start = float(item.get("start", 0.0))
        items.append({"text": text, "start": start, "end": start + float(item.get("duration", 0.0))})

    items.sort(key=lambda x: x["start"])
    for current, following in zip(items, items[1:]):
        if current["end"] > following["start"]:
            current["end"] = following["start"]
        if current["end"] < current["start"]:
            current["end"] = current["start"]
    return items


def _merge_into_sentences(raw: list[dict]) -> list[dict]:
    """把碎片字幕合併成接近句子的段落，回傳 [{start_ms, end_ms, text}]。"""
    fragments = _normalize_fragments(raw)

    merged: list[dict] = []
    buf_text: list[str] = []
    buf_start: float | None = None
    buf_end: float = 0.0

    def flush():
        nonlocal buf_text, buf_start, buf_end
        if buf_start is None or not buf_text:
            return
        merged.append(
            {
                "start_ms": int(buf_start * 1000),
                "end_ms": int(buf_end * 1000),
                "text": " ".join(buf_text),
            }
        )
        buf_text, buf_start, buf_end = [], None, 0.0

    for fragment in fragments:
        if buf_start is None:
            buf_start = fragment["start"]
        buf_text.append(fragment["text"])
        buf_end = fragment["end"]  # 已夾過重疊，直接用這段的結束

        joined_len = sum(len(t) + 1 for t in buf_text)
        ends_sentence = fragment["text"].endswith((".", "?", "!", "…"))
        too_long = (buf_end - buf_start) * 1000 >= _MAX_SEGMENT_MS or joined_len >= _MAX_SEGMENT_CHARS
        if ends_sentence or too_long:
            flush()

    flush()
    return merged


# ── Whisper fallback ────────────────────────────────────
def _download_audio(youtube_id: str, target_dir: str) -> Path:
    """只下載 bestaudio、不做轉檔，因此不需要 ffmpeg（Whisper 吃 m4a / webm）。"""
    import yt_dlp

    options = {
        "format": "bestaudio[ext=m4a]/bestaudio",
        "outtmpl": os.path.join(target_dir, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={youtube_id}", download=True)
        return Path(ydl.prepare_filename(info))


def _transcribe_with_whisper(youtube_id: str, user_id: int) -> list[dict]:
    from openai import OpenAI

    cfg = llm_provider_service.get_active_config(user_id)
    if cfg["provider"] != "openai":
        raise ValueError(
            "這支影片沒有英文字幕，需要用 Whisper 轉錄，"
            "但你目前啟用的是 Ollama。請到「設定」啟用一組 OpenAI provider 後重試。"
        )

    with tempfile.TemporaryDirectory() as tmp:
        audio_path = _download_audio(youtube_id, tmp)
        size = audio_path.stat().st_size
        if size > _WHISPER_MAX_BYTES:
            raise ValueError(
                f"音訊檔 {size / 1024 / 1024:.1f}MB 超過 Whisper API 的 25MB 上限，"
                "請改用較短的影片，或找有字幕的版本。"
            )

        client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"])
        with audio_path.open("rb") as f:
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="en",
                response_format="verbose_json",  # 要時間軸就得用這個格式
            )

    segments = getattr(result, "segments", None) or []
    return [
        {
            "start_ms": int(float(s.start) * 1000),
            "end_ms": int(float(s.end) * 1000),
            "text": _clean(s.text),
        }
        for s in segments
        if _clean(getattr(s, "text", ""))
    ]


# ── 寫入 ────────────────────────────────────────────────
def _save_segments(video_id: int, segments: list[dict], source: str) -> None:
    with engine.begin() as conn:
        # 重跑時先清掉舊的，避免重複
        conn.execute(delete(transcript_segments).where(transcript_segments.c.video_id == video_id))
        if segments:
            conn.execute(
                insert(transcript_segments),
                [
                    {
                        "video_id": video_id,
                        "idx": i,
                        "start_ms": s["start_ms"],
                        "end_ms": s["end_ms"],
                        "text": s["text"],
                    }
                    for i, s in enumerate(segments)
                ],
            )
        conn.execute(
            update(videos)
            .where(videos.c.id == video_id)
            .values(transcript_status="ready", transcript_source=source, error_message=None)
        )


def _mark_failed(video_id: int, message: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            update(videos)
            .where(videos.c.id == video_id)
            .values(transcript_status="failed", error_message=message[:1000])
        )


def ingest(video_id: int, youtube_id: str, user_id: int) -> None:
    """背景工作：抓字幕 → 失敗改 Whisper → 寫入 segments。任何例外都寫回 DB。"""
    try:
        raw = _fetch_captions(youtube_id)
        segments = _merge_into_sentences(raw)
        if segments:
            _save_segments(video_id, segments, "caption")
            return
        caption_error = "字幕內容是空的"
    except Exception as e:  # 字幕不存在 / 被停用 / 網路問題，都轉走 Whisper
        caption_error = f"{type(e).__name__}: {e}"

    try:
        segments = _transcribe_with_whisper(youtube_id, user_id)
        if not segments:
            raise ValueError("Whisper 沒有回傳任何內容")
        _save_segments(video_id, segments, "whisper")
    except Exception as e:
        _mark_failed(
            video_id,
            f"字幕擷取失敗（{caption_error}）；Whisper 轉錄也失敗（{type(e).__name__}: {e}）",
        )
