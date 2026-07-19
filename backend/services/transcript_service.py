"""文字稿：使用者手動貼上，加上 AI 重新斷句。

**沒有自動擷取**。YouTube 封鎖所有雲端供應商的 IP，部署在 Cloud Run 上時
字幕 API 與 yt-dlp 一律回 RequestBlocked，留著那條路只會製造一定會失敗的按鈕。
改成使用者從 YouTube 的「顯示轉錄稿」複製貼上（見 parse_manual_transcript）。

兩層資料：
  transcript_fragments  最初的細碎片段（2~5 秒），保留時間解析度
  transcript_segments   合併後給人看、給 AB 擷取用的段落
重新斷句時要靠 fragments 推算字級時間，所以兩層都要存。
"""

import re

from sqlalchemy import delete, insert, select, update

from db.engine import engine
from db.tables import transcript_fragments, transcript_segments, videos

# 合併片段時的上限：超過就斷句，避免整段黏成一大塊
_MAX_SEGMENT_MS = 8_000
_MAX_SEGMENT_CHARS = 160

# 說話停頓多久算一句話結束。
# 自動字幕沒有標點，只靠長度上限硬切一定會切在句子中間；
# 停頓是唯一免費又可靠的句界線索。
_PAUSE_MS = 700


def _clean(text: str) -> str:
    # 字幕常見的換行與音效標記，留著會干擾閱讀與聽寫比對
    return " ".join(text.replace("\n", " ").split())


# ── 片段整理與合併 ──────────────────────────────────────
def _normalize_fragments(raw: list[dict]) -> list[dict]:
    """整理原始片段，回傳 [{text, start, end}]（秒）。

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


def _to_fragments(raw: list[dict]) -> list[dict]:
    """原始片段 → [{start_ms, end_ms, text}]（毫秒）。"""
    return [
        {
            "start_ms": int(f["start"] * 1000),
            "end_ms": int(f["end"] * 1000),
            "text": f["text"],
        }
        for f in _normalize_fragments(raw)
    ]


def _merge_into_sentences(raw: list[dict]) -> list[dict]:
    """把碎片合併成接近句子的段落，回傳 [{start_ms, end_ms, text}]。"""
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

    for index, fragment in enumerate(fragments):
        if buf_start is None:
            buf_start = fragment["start"]
        buf_text.append(fragment["text"])
        buf_end = fragment["end"]  # 已夾過重疊，直接用這段的結束

        joined_len = sum(len(t) + 1 for t in buf_text)
        ends_sentence = fragment["text"].endswith((".", "?", "!", "…"))
        too_long = (buf_end - buf_start) * 1000 >= _MAX_SEGMENT_MS or joined_len >= _MAX_SEGMENT_CHARS

        # 和下一段之間有明顯停頓 → 當成句子結束
        following = fragments[index + 1] if index + 1 < len(fragments) else None
        pause = following is not None and (following["start"] - buf_end) * 1000 >= _PAUSE_MS

        if ends_sentence or pause or too_long:
            flush()

    flush()
    return merged


# ── 寫入 ────────────────────────────────────────────────
def _save_fragments(video_id: int, fragments: list[dict]) -> None:
    """保存原始細碎片段，供之後「重新斷句」推算字級時間。"""
    with engine.begin() as conn:
        conn.execute(
            delete(transcript_fragments).where(transcript_fragments.c.video_id == video_id)
        )
        if fragments:
            conn.execute(
                insert(transcript_fragments),
                [
                    {
                        "video_id": video_id,
                        "idx": i,
                        "start_ms": f["start_ms"],
                        "end_ms": f["end_ms"],
                        "text": f["text"],
                    }
                    for i, f in enumerate(fragments)
                ],
            )


def _save_segments(video_id: int, segments: list[dict]) -> None:
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
            .values(transcript_status="ready", transcript_source="manual", error_message=None)
        )


# ── 手動貼上字幕 ────────────────────────────────────────
# 支援三種常見格式：
#   1. SRT / VTT     00:00:01,000 --> 00:00:04,000
#   2. YouTube 轉錄稿面板複製的內容   0:05 <換行或空白> 文字
#   3. 上面兩種的混合（多餘的序號、空行都會被忽略）
_RANGE_RE = re.compile(
    r"(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})"
)
_LEADING_TS_RE = re.compile(r"^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?[\s\]]*(.*)$")

# 沒有結束時間可推算時，用每個字約 350ms 估
_MS_PER_WORD = 350
_MIN_DURATION_MS = 1500


def _timestamp_to_ms(value: str) -> int:
    parts = [float(p) for p in value.replace(",", ".").split(":")]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    hours, minutes, seconds = parts
    return int((hours * 3600 + minutes * 60 + seconds) * 1000)


def parse_manual_transcript(raw: str) -> list[dict]:
    """把貼上的字幕解析成 [{text, start, duration}]（秒）。解析不出來就丟 ValueError。"""
    lines = [line.strip() for line in raw.splitlines()]
    entries: list[dict] = []

    # ── 格式 1：SRT / VTT ──
    index = 0
    while index < len(lines):
        match = _RANGE_RE.search(lines[index])
        if match:
            start_ms = _timestamp_to_ms(match.group(1))
            end_ms = _timestamp_to_ms(match.group(2))
            index += 1
            chunk: list[str] = []
            while index < len(lines) and lines[index] and not _RANGE_RE.search(lines[index]):
                if not lines[index].isdigit():  # 跳過 SRT 的序號
                    chunk.append(lines[index])
                index += 1
            text = _clean(" ".join(chunk))
            if text:
                entries.append({"start_ms": start_ms, "end_ms": max(end_ms, start_ms + 1), "text": text})
        else:
            index += 1

    # ── 格式 2：開頭是時間戳的行 ──
    if not entries:
        pending_start: int | None = None
        chunk = []
        for line in lines:
            if not line:
                continue
            match = _LEADING_TS_RE.match(line)
            if match and match.group(1):
                if pending_start is not None and chunk:
                    entries.append({"start_ms": pending_start, "end_ms": 0, "text": _clean(" ".join(chunk))})
                pending_start = _timestamp_to_ms(match.group(1))
                chunk = [match.group(2)] if match.group(2) else []
            elif pending_start is not None:
                chunk.append(line)
        if pending_start is not None and chunk:
            entries.append({"start_ms": pending_start, "end_ms": 0, "text": _clean(" ".join(chunk))})

        # 結束時間用下一段的開始補；最後一段用字數估
        for current, following in zip(entries, entries[1:]):
            current["end_ms"] = following["start_ms"]
        if entries:
            last = entries[-1]
            last["end_ms"] = last["start_ms"] + max(
                _MIN_DURATION_MS, len(last["text"].split()) * _MS_PER_WORD
            )

    entries = [e for e in entries if e["text"]]
    if not entries:
        raise ValueError(
            "看不懂這份字幕的格式。請貼上含時間軸的內容，例如 SRT／VTT 檔，"
            "或 YouTube「顯示轉錄稿」面板複製出來的文字（每段前面要有 0:05 這種時間）。"
        )

    return [
        {
            "text": e["text"],
            "start": e["start_ms"] / 1000,
            "duration": max(0, e["end_ms"] - e["start_ms"]) / 1000,
        }
        for e in sorted(entries, key=lambda e: e["start_ms"])
    ]


def ingest_manual(video_id: int, raw: str) -> int:
    """存入手動貼上的字幕，回傳段落數。"""
    parsed = parse_manual_transcript(raw)
    _save_fragments(video_id, _to_fragments(parsed))
    segments = _merge_into_sentences(parsed)
    _save_segments(video_id, segments)
    return len(segments)


# ── AI 重新斷句（一句一段）─────────────────────────────
# 難點：自動字幕的片段不會剛好切在句尾，「句子結束在第幾秒」表面上無從得知。
# 解法是**字級時間內插**：
#   每個片段有起訖時間與固定字數 → 推算每個字大約落在什麼時間 →
#   LLM 只負責補標點斷句（不准改字）→ 再把句子的字對回時間軸。
# 誤差約 ±0.2~0.3 秒，對 AB 循環與逐句對照完全夠用。
_RESEGMENT_SYSTEM = """你會拿到一段英文語音辨識的逐字稿，沒有標點、大小寫也不正確。

請把它切成一句一句：
- 每個輸出項目**剛好是一個完整句子**，不要把多句合在一起。
- 補上正確的標點與大小寫。
- **絕對不可以改動、增加或刪除任何單字**，單字順序必須與原文完全相同。
  你只能加標點、調整大小寫。
- 句子太長時可在自然的子句邊界（例如 and / but / because 之前）切開。"""

# 一次送給 LLM 的字數（太多容易漏字，太少會切斷句子）
_RESEGMENT_BATCH_WORDS = 400

# 對齊時容許模型輕微改字，往後找幾個位置重新同步
_ALIGN_LOOKAHEAD = 6


def _build_word_timeline(fragments: list[dict]) -> list[dict]:
    """把片段攤平成 [{word, start_ms, end_ms}]，片段內用字數平均內插。"""
    words: list[dict] = []
    for fragment in fragments:
        tokens = fragment["text"].split()
        if not tokens:
            continue
        span = max(1, fragment["end_ms"] - fragment["start_ms"])
        step = span / len(tokens)
        for i, token in enumerate(tokens):
            words.append(
                {
                    "word": token,
                    "start_ms": int(fragment["start_ms"] + i * step),
                    "end_ms": int(fragment["start_ms"] + (i + 1) * step),
                }
            )
    return words


def _normalize_word(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


def _align_sentences(sentences: list[str], words: list[dict]) -> list[dict]:
    """把 LLM 斷好的句子對回字級時間軸。"""
    segments: list[dict] = []
    position = 0

    for sentence in sentences:
        tokens = [t for t in (_normalize_word(w) for w in sentence.split()) if t]
        if not tokens or position >= len(words):
            continue

        # 對齊起點：模型若動了個別字，往後找幾格重新同步
        for shift in range(_ALIGN_LOOKAHEAD):
            if (
                position + shift < len(words)
                and _normalize_word(words[position + shift]["word"]) == tokens[0]
            ):
                position += shift
                break

        start = position
        end = min(len(words) - 1, position + len(tokens) - 1)
        segments.append(
            {
                "start_ms": words[start]["start_ms"],
                "end_ms": words[end]["end_ms"],
                "text": sentence.strip(),
            }
        )
        position = end + 1

    return segments


def resegment_with_llm(user_id: int, video_id: int) -> int:
    """用 LLM 重新斷句成「一句一段」，回傳新的段落數。"""
    from agents.schemas import PunctuatedSentences
    from db.tables import phrases
    from llm import get_chat_model

    with engine.connect() as conn:
        fragment_rows = conn.execute(
            select(transcript_fragments)
            .where(transcript_fragments.c.video_id == video_id)
            .order_by(transcript_fragments.c.idx)
        )
        fragments = [dict(r._mapping) for r in fragment_rows]

        if not fragments:
            # 舊資料沒有存原始片段，退而求其次用現有段落（時間解析度較差）
            segment_rows = conn.execute(
                select(transcript_segments)
                .where(transcript_segments.c.video_id == video_id)
                .order_by(transcript_segments.c.idx)
            )
            fragments = [dict(r._mapping) for r in segment_rows]

    if not fragments:
        raise ValueError("這支影片還沒有文字稿")

    words = _build_word_timeline(fragments)
    if not words:
        raise ValueError("文字稿是空的")

    llm = get_chat_model(user_id).with_structured_output(PunctuatedSentences)

    sentences: list[str] = []
    for offset in range(0, len(words), _RESEGMENT_BATCH_WORDS):
        batch = words[offset : offset + _RESEGMENT_BATCH_WORDS]
        result = llm.invoke(
            [("system", _RESEGMENT_SYSTEM), ("human", " ".join(w["word"] for w in batch))]
        )
        sentences.extend(s for s in result.sentences if s.strip())

    rebuilt = _align_sentences(sentences, words)

    # 對齊涵蓋率太低代表模型漏了一大段，寧可不動
    covered = sum(len(s["text"].split()) for s in rebuilt)
    if not rebuilt or covered < len(words) * 0.8:
        raise ValueError(
            f"重新斷句失敗：只對應到 {covered}/{len(words)} 個字，已保留原本的文字稿。請再試一次。"
        )

    with engine.begin() as conn:
        # 段落會重建，已收藏片語指向的舊 segment_id 會失效，先解除關聯
        conn.execute(
            update(phrases).where(phrases.c.video_id == video_id).values(segment_id=None)
        )

    _save_segments(video_id, rebuilt)
    return len(rebuilt)
