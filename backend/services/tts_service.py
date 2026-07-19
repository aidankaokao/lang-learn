"""文字轉語音：微軟 Edge 的 Neural 語音（透過開源套件 edge-tts）。

為什麼不用瀏覽器內建的 Web Speech API：
微軟語音是 Windows 的系統語音，Linux / macOS 的瀏覽器根本拿不到，
Linux 上通常只剩 espeak，機械感很重。走 edge-tts 則不分作業系統，
拿到的都是同一組 Neural 語音，而且免金鑰、不收費。

合成結果會依「文字 + 語音 + 語速」快取成 mp3 檔，重複朗讀同一句不會再打一次。
"""

import hashlib
from pathlib import Path

# 精選清單（英國腔優先，這是開發者指定的）。
# 完整清單可用 `edge-tts --list-voices` 查。
VOICES = [
    {"id": "en-GB-SoniaNeural", "label": "Sonia — 英國腔・女聲"},
    {"id": "en-GB-RyanNeural", "label": "Ryan — 英國腔・男聲"},
    {"id": "en-GB-LibbyNeural", "label": "Libby — 英國腔・女聲（年輕）"},
    {"id": "en-GB-ThomasNeural", "label": "Thomas — 英國腔・男聲（沉穩）"},
    {"id": "en-GB-MaisieNeural", "label": "Maisie — 英國腔・少女聲"},
    {"id": "en-US-AriaNeural", "label": "Aria — 美國腔・女聲"},
    {"id": "en-US-GuyNeural", "label": "Guy — 美國腔・男聲"},
]

DEFAULT_VOICE = "en-GB-SoniaNeural"

_VOICE_IDS = {v["id"] for v in VOICES}
_MAX_CHARS = 1000

_CACHE_DIR = Path("data/tts")


def _cache_path(text: str, voice: str, rate: int) -> Path:
    key = hashlib.sha256(f"{voice}|{rate}|{text}".encode()).hexdigest()
    return _CACHE_DIR / f"{key}.mp3"


async def synthesize(text: str, voice: str = DEFAULT_VOICE, rate: int = 0) -> bytes:
    """回傳 mp3 位元組。rate 是相對語速百分比（-50 ~ +50，0 為原速）。"""
    import edge_tts

    text = text.strip()
    if not text:
        raise ValueError("沒有要朗讀的內容")
    if len(text) > _MAX_CHARS:
        raise ValueError(f"文字太長了（上限 {_MAX_CHARS} 字元）")
    if voice not in _VOICE_IDS:
        raise ValueError(f"未知的語音：{voice}")
    if not -50 <= rate <= 50:
        raise ValueError("語速需介於 -50% 與 +50% 之間")

    cached = _cache_path(text, voice, rate)
    if cached.exists():
        return cached.read_bytes()

    communicate = edge_tts.Communicate(text, voice, rate=f"{rate:+d}%")
    buffer = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.extend(chunk["data"])

    if not buffer:
        raise ValueError("語音合成失敗：沒有取得音訊")

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(buffer)
    return bytes(buffer)
