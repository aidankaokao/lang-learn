"""LLM 建構的唯一入口（見 reference/backend/llm-integration.md §3、§5）。

上層（service / LangGraph node）一律 `from llm import get_chat_model`，
不直接 new ChatOpenAI / ChatOllama，也不寫死 base_url 與模型名稱。

本專案有前端，設定來自資料庫（使用者在設定頁註冊多筆、選一筆 active），
所以工廠要帶 user_id；對上層的用法（invoke / stream / bind_tools）完全不變。
"""

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from openai import OpenAI

from services.llm_provider_service import get_active_config, get_speech_config


def build_chat_model(cfg: dict, temperature: float | None = None) -> BaseChatModel:
    """由一筆設定 dict 建構 chat model。cfg 需含明文 api_key。"""
    temp = cfg.get("temperature", 0.0) if temperature is None else temperature

    if cfg["provider"] == "ollama":
        return ChatOllama(model=cfg["model"], base_url=cfg["base_url"], temperature=temp)

    if cfg["provider"] == "openai":
        # 外部 OpenAI 或本地 vLLM：差別只在 base_url / api_key
        return ChatOpenAI(
            model=cfg["model"],
            base_url=cfg["base_url"],
            api_key=cfg.get("api_key") or "EMPTY",  # vLLM 常不驗 key
            temperature=temp,
        )

    raise ValueError(f"未知的 provider: {cfg['provider']!r}")


def get_chat_model(
    user_id: int,
    provider_id: int | None = None,
    temperature: float | None = None,
) -> BaseChatModel:
    """取得該使用者目前選用（active）的 chat model。

    provider_id 指定時改用那一筆（例如設定頁的「測試連線」）。
    沒有可用設定時丟 ValueError，由 router 轉成 400 提示使用者去設定頁。
    """
    return build_chat_model(get_active_config(user_id, provider_id), temperature)


# ── 語音轉文字（Whisper）────────────────────────────────
# 只用來替「有文字稿、沒時間軸」的音檔（BBC）取得字級時間，文字仍以原文字稿為準。
# 不是 chat model，所以不走 build_chat_model；設定一樣從 DB 讀、跟著帳號走。
_WHISPER_MODEL = "whisper-1"  # 目前只有 whisper-1 支援字級時間戳（timestamp_granularities）


def transcribe_words(user_id: int, audio: bytes, filename: str = "audio.mp3") -> dict:
    """回 {"duration_ms": int, "words": [{word, start_ms, end_ms}]}。"""
    cfg = get_speech_config(user_id)
    client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"], timeout=180)
    try:
        result = client.audio.transcriptions.create(
            model=_WHISPER_MODEL,
            file=(filename, audio, "audio/mpeg"),
            language="en",
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )
    except Exception as e:  # SDK 的錯誤型別很多，統一轉成給使用者看的訊息
        raise ValueError(f"Whisper 語音辨識失敗（{cfg['name']}）：{e}") from e

    words = [
        {"word": w.word, "start_ms": int(w.start * 1000), "end_ms": int(w.end * 1000)}
        for w in (getattr(result, "words", None) or [])
    ]
    return {"duration_ms": int((getattr(result, "duration", 0) or 0) * 1000), "words": words}
