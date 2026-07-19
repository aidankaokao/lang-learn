"""文字轉語音。掛載後路徑為 /api/tts*。"""

import traceback

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from security import get_current_user
from services import tts_service

router = APIRouter(prefix="/tts", tags=["tts"])


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    voice: str | None = None
    rate: int = 0  # 相對語速百分比，-50 ~ +50


@router.get("/voices")
def list_voices(_: dict = Depends(get_current_user)):
    return {"voices": tts_service.VOICES, "default": tts_service.DEFAULT_VOICE}


@router.post("")
async def speak(body: SpeakIn, _: dict = Depends(get_current_user)):
    try:
        audio = await tts_service.synthesize(
            body.text, body.voice or tts_service.DEFAULT_VOICE, body.rate
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # edge-tts 走的是微軟未公開的端點，對方擋掉、版本過舊或斷線都可能失敗。
        # 這是自架服務，錯誤訊息直接吐出來才有辦法查（不含任何金鑰）。
        traceback.print_exc()
        raise HTTPException(
            status_code=502, detail=f"語音服務失敗：{type(e).__name__}: {e}"[:400]
        )

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )
