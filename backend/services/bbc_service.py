"""BBC Learning English（例：The English We Speak）的網頁解析。

一集的網頁裡同時有：
  - 音檔直連（downloads.bbc.co.uk/...mp3）→ 前端用 <audio> 直接播，我們不存音檔
  - 文字稿（"Transcript" 標題之後的 <p>，一段一個說話者）→ 文字正確但**沒有時間軸**
時間軸交給 Whisper 產生字級時間，再把原文字稿對上去（transcript_service.align_known_text）。

只用標準庫（urllib + re），BBC 的頁面結構很規律，不需要 HTML 解析套件。
"""

import hashlib
import html
import re
import urllib.error
import urllib.parse
import urllib.request

_USER_AGENT = "Mozilla/5.0 (compatible; lang-learn/1.0)"
_TIMEOUT = 20

# Whisper API 單檔上限 25MB；一集通常 2~10MB
_MAX_AUDIO_BYTES = 25 * 1024 * 1024

_MP3_RE = re.compile(r"https?://downloads\.bbc\.co\.uk/[^\"'\s<>]+?\.mp3")
_META_RE = r'<meta\s+property="{}"\s+content="([^"]*)"'
_TRANSCRIPT_HEAD_RE = re.compile(r"<strong[^>]*>\s*Transcript\s*</strong>", re.IGNORECASE)
# 文字稿之後的下一個區塊標題（例 "Next"）是帶 style 的 <strong>；找不到就看區塊結尾
_SECTION_END_RE = re.compile(r"<strong\s+style=|</div>", re.IGNORECASE)
_PARAGRAPH_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
# 「<strong>Feifei</strong><br />台詞」—— 開頭的說話者名字不收進文字稿
_SPEAKER_RE = re.compile(r"^\s*<strong>[^<]{1,40}</strong>\s*<br\s*/?>", re.IGNORECASE)
# 單獨一個 <strong> 的段落是小標（例 "Examples"），不是台詞
_HEADING_ONLY_RE = re.compile(r"^\s*<strong>.*</strong>\s*$", re.IGNORECASE | re.DOTALL)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+(?=[\"'(]?[A-Z0-9])")

# 彎引號換成直的：聽寫比對、Whisper 對齊都以直引號為準
_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'})


def is_bbc_url(url: str) -> bool:
    host = urllib.parse.urlparse(url.strip()).netloc.lower()
    return host.endswith("bbc.co.uk") or host.endswith("bbc.com")


def source_key(url: str) -> str:
    """videos.youtube_id 欄位用的唯一鍵（≤ 32 字）。

    只用最後一段（ep-260921）會撞：不同節目在同一天的集數代號一樣，所以加上路徑雜湊。
    """
    path = urllib.parse.urlparse(url.strip()).path.rstrip("/")
    slug = path.rsplit("/", 1)[-1][:16]
    digest = hashlib.sha1(path.encode()).hexdigest()[:8]
    return f"bbc:{slug}-{digest}"


def _download(url: str, limit: int | None = None) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT) as resp:
            data = resp.read(limit + 1 if limit else -1)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ValueError(f"連不上 BBC（{e}）") from e
    if limit and len(data) > limit:
        raise ValueError("音檔超過 25MB，Whisper 無法處理")
    return data


def _clean(fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", " ", fragment, flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).translate(_QUOTES)
    return " ".join(text.split())


def parse_page(page: str) -> dict:
    """回 {title, thumbnail_url, audio_url, sentences}；缺音檔或文字稿就丟 ValueError。"""
    audio = _MP3_RE.search(page)
    if audio is None:
        raise ValueError("這個網頁裡找不到音檔下載連結，目前只支援有 mp3 的 BBC Learning English 節目")

    head = _TRANSCRIPT_HEAD_RE.search(page)
    if head is None:
        raise ValueError("這個網頁裡找不到文字稿（Transcript）")
    tail = _SECTION_END_RE.search(page, head.end())
    body = page[head.end() : tail.start() if tail else len(page)]

    sentences: list[str] = []
    for paragraph in _PARAGRAPH_RE.findall(body):
        speaker = _SPEAKER_RE.match(paragraph)
        if speaker:
            paragraph = paragraph[speaker.end() :]
        elif _HEADING_ONLY_RE.match(paragraph):
            continue
        text = _clean(paragraph)
        if text:
            sentences.extend(s for s in _SENTENCE_SPLIT_RE.split(text) if s.strip())

    if not sentences:
        raise ValueError("文字稿是空的，可能是 BBC 改了網頁格式")

    title = re.search(_META_RE.format("og:title"), page)
    image = re.search(_META_RE.format("og:image"), page)
    return {
        # og:title 長這樣：「BBC Learning English - The English We Speak / Same person, different font」
        "title": html.unescape(title.group(1)).removeprefix("BBC Learning English - ") if title else None,
        "thumbnail_url": image.group(1) if image else None,
        "audio_url": audio.group(0),
        "sentences": sentences,
    }


def fetch_episode(url: str) -> dict:
    """抓網頁並解析，另外回 audio（mp3 的 bytes，只給 Whisper 用，不落地）。"""
    page = _download(url.strip()).decode("utf-8", errors="replace")
    episode = parse_page(page)
    episode["audio"] = _download(episode["audio_url"], limit=_MAX_AUDIO_BYTES)
    return episode
