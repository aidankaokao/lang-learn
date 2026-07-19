"""LLM provider 設定（每個使用者各自註冊多筆，選一筆 active）。

見 reference/backend/llm-integration.md §5。
安全原則：api_key 以 Fernet 加密存 DB，對外一律只給遮罩，明文只在建構 chat model 時解出來。
"""

from sqlalchemy import delete, insert, select, update

from crypto import decrypt, encrypt, mask
from db.engine import engine
from db.tables import llm_providers

PROVIDERS = ("openai", "ollama")

DEFAULT_BASE_URL = {
    "openai": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434",
}


def _public(row) -> dict:
    """對外回傳：api_key 只給遮罩，且用 has_api_key 表示有沒有設定過。"""
    d = dict(row._mapping)
    enc = d.pop("api_key_enc", None)
    plain = decrypt(enc) if enc else ""
    d["api_key_masked"] = mask(plain)
    d["has_api_key"] = bool(plain)
    return d


def _validate(provider: str, base_url: str, model: str, temperature: float) -> None:
    if provider not in PROVIDERS:
        raise ValueError(f"未知的 provider：{provider}（可用：{', '.join(PROVIDERS)}）")
    if not base_url.strip():
        raise ValueError("base_url 不可空白")
    if not model.strip():
        raise ValueError("模型名稱不可空白")
    if not 0.0 <= temperature <= 2.0:
        raise ValueError("temperature 需介於 0 與 2 之間")


# ── 查詢 ────────────────────────────────────────────────
def list_providers(user_id: int) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            select(llm_providers)
            .where(llm_providers.c.user_id == user_id)
            .order_by(llm_providers.c.created_at)
        )
        return [_public(r) for r in rows]


def _get_row(user_id: int, provider_id: int):
    with engine.connect() as conn:
        return conn.execute(
            select(llm_providers).where(
                llm_providers.c.id == provider_id,
                llm_providers.c.user_id == user_id,
            )
        ).first()


def get_provider(user_id: int, provider_id: int) -> dict | None:
    row = _get_row(user_id, provider_id)
    return _public(row) if row is not None else None


def get_active_config(user_id: int, provider_id: int | None = None) -> dict:
    """給 llm 工廠用：回傳含**明文 api_key** 的設定，不可直接回給前端。"""
    if provider_id is not None:
        row = _get_row(user_id, provider_id)
    else:
        with engine.connect() as conn:
            row = conn.execute(
                select(llm_providers).where(
                    llm_providers.c.user_id == user_id,
                    llm_providers.c.is_active.is_(True),
                )
            ).first()

    if row is None:
        raise ValueError("尚未設定可用的 LLM provider，請先到「設定」頁註冊一組並啟用")

    cfg = dict(row._mapping)
    cfg["api_key"] = decrypt(cfg.pop("api_key_enc") or "")
    return cfg


# ── 新增 / 修改 / 刪除 ──────────────────────────────────
def create_provider(
    user_id: int,
    name: str,
    provider: str,
    model: str,
    base_url: str | None = None,
    api_key: str = "",
    temperature: float = 0.0,
) -> dict:
    base_url = (base_url or DEFAULT_BASE_URL.get(provider, "")).strip()
    _validate(provider, base_url, model, temperature)
    if not name.strip():
        raise ValueError("顯示名稱不可空白")
    if provider == "openai" and not api_key.strip():
        raise ValueError("OpenAI 類型需要 API key（本地 vLLM 可填 EMPTY）")

    # 第一筆自動設為啟用，省得使用者還要再按一次
    is_first = len(list_providers(user_id)) == 0

    with engine.begin() as conn:
        result = conn.execute(
            insert(llm_providers).values(
                user_id=user_id,
                name=name.strip(),
                provider=provider,
                base_url=base_url,
                model=model.strip(),
                api_key_enc=encrypt(api_key) if api_key else None,
                temperature=temperature,
                is_active=is_first,
            )
        )
        new_id = result.inserted_primary_key[0]
    return get_provider(user_id, new_id)


def update_provider(
    user_id: int,
    provider_id: int,
    name: str,
    provider: str,
    model: str,
    base_url: str | None = None,
    api_key: str | None = None,
    temperature: float = 0.0,
) -> dict:
    current = _get_row(user_id, provider_id)
    if current is None:
        raise ValueError("找不到這組設定")

    base_url = (base_url or DEFAULT_BASE_URL.get(provider, "")).strip()
    _validate(provider, base_url, model, temperature)
    if not name.strip():
        raise ValueError("顯示名稱不可空白")

    values = {
        "name": name.strip(),
        "provider": provider,
        "base_url": base_url,
        "model": model.strip(),
        "temperature": temperature,
    }
    # api_key 留空 = 不更動原本存的（前端拿不到明文，不可能原樣送回來）
    if api_key:
        values["api_key_enc"] = encrypt(api_key)

    with engine.begin() as conn:
        conn.execute(
            update(llm_providers)
            .where(llm_providers.c.id == provider_id, llm_providers.c.user_id == user_id)
            .values(**values)
        )
    return get_provider(user_id, provider_id)


def set_active(user_id: int, provider_id: int) -> dict:
    if _get_row(user_id, provider_id) is None:
        raise ValueError("找不到這組設定")
    with engine.begin() as conn:
        # 同一使用者同時只有一筆 active
        conn.execute(
            update(llm_providers)
            .where(llm_providers.c.user_id == user_id)
            .values(is_active=False)
        )
        conn.execute(
            update(llm_providers)
            .where(llm_providers.c.id == provider_id)
            .values(is_active=True)
        )
    return get_provider(user_id, provider_id)


def delete_provider(user_id: int, provider_id: int) -> None:
    row = _get_row(user_id, provider_id)
    if row is None:
        raise ValueError("找不到這組設定")

    with engine.begin() as conn:
        conn.execute(
            delete(llm_providers).where(
                llm_providers.c.id == provider_id,
                llm_providers.c.user_id == user_id,
            )
        )

    # 刪掉的是啟用中那筆 → 自動把剩下的第一筆補上，避免變成沒有 active
    if row._mapping["is_active"]:
        remaining = list_providers(user_id)
        if remaining:
            set_active(user_id, remaining[0]["id"])
