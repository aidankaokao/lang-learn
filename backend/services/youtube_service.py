"""YouTube 網址解析與影片基本資訊。

metadata 走 oEmbed（免 API key、免額外套件，用標準庫的 urllib 即可），
拿不到就只留 youtube_id，不影響後續流程。
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request

_OEMBED = "https://www.youtube.com/oembed"

# 支援 watch?v= / youtu.be / embed / shorts / live，以及直接貼 11 碼 ID
_PATTERNS = (
    re.compile(r"(?:v=|/embed/|/shorts/|/live/|youtu\.be/)([A-Za-z0-9_-]{11})"),
    re.compile(r"^([A-Za-z0-9_-]{11})$"),
)


def extract_video_id(url: str) -> str:
    url = url.strip()
    for pattern in _PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    raise ValueError("看不懂這個 YouTube 網址，請確認格式（例：https://www.youtube.com/watch?v=xxxxxxxxxxx）")


def fetch_metadata(youtube_id: str) -> dict:
    """回 {title, channel, thumbnail_url}；抓不到就回空 dict（不讓匯入失敗）。"""
    params = urllib.parse.urlencode(
        {"url": f"https://www.youtube.com/watch?v={youtube_id}", "format": "json"}
    )
    try:
        with urllib.request.urlopen(f"{_OEMBED}?{params}", timeout=10) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {}

    return {
        "title": data.get("title"),
        "channel": data.get("author_name"),
        "thumbnail_url": data.get("thumbnail_url"),
    }
