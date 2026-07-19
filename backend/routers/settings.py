"""使用者的 LLM provider 設定。掛載後路徑為 /api/settings/llm-providers*。

每個使用者只看得到 / 改得動自己的設定（一律用 current_user 的 id 過濾）。
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from security import get_current_user
from services import llm_provider_service as svc

router = APIRouter(prefix="/settings", tags=["settings"])


class ProviderIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider: str = "openai"  # openai | ollama
    model: str = Field(min_length=1, max_length=120)
    base_url: str | None = None  # 留空用該 provider 的預設值
    api_key: str | None = None  # 編輯時留空 = 不更動原本存的 key
    temperature: float = 0.0


@router.get("/llm-providers")
def list_providers(user: dict = Depends(get_current_user)):
    return svc.list_providers(user["id"])


@router.post("/llm-providers", status_code=201)
def create_provider(body: ProviderIn, user: dict = Depends(get_current_user)):
    try:
        return svc.create_provider(
            user["id"],
            name=body.name,
            provider=body.provider,
            model=body.model,
            base_url=body.base_url,
            api_key=body.api_key or "",
            temperature=body.temperature,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/llm-providers/{provider_id}")
def update_provider(provider_id: int, body: ProviderIn, user: dict = Depends(get_current_user)):
    try:
        return svc.update_provider(
            user["id"],
            provider_id,
            name=body.name,
            provider=body.provider,
            model=body.model,
            base_url=body.base_url,
            api_key=body.api_key,
            temperature=body.temperature,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/llm-providers/{provider_id}/active")
def set_active(provider_id: int, user: dict = Depends(get_current_user)):
    try:
        return svc.set_active(user["id"], provider_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/llm-providers/{provider_id}", status_code=204)
def delete_provider(provider_id: int, user: dict = Depends(get_current_user)):
    try:
        svc.delete_provider(user["id"], provider_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/llm-providers/{provider_id}/test")
def test_provider(provider_id: int, user: dict = Depends(get_current_user)):
    """實際呼叫一次模型，確認 key / base_url / 模型名稱都是通的。"""
    from llm import get_chat_model  # 延遲 import：沒設定 provider 時不必載入 langchain

    try:
        model = get_chat_model(user["id"], provider_id=provider_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        resp = model.invoke("Reply with exactly: OK")
    except Exception as e:
        # 對外只給精簡訊息，避免把 api_key 之類的細節漏進錯誤字串
        raise HTTPException(status_code=400, detail=f"呼叫失敗：{type(e).__name__}: {e}"[:300])

    return {"ok": True, "reply": str(resp.content)[:200]}
