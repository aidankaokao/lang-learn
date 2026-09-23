"""Tutor 問答：對話紀錄存 DB，實際回答交給 agents/tutor.py。

thread_id 由前端產生（一支影片一條，或使用者開新對話時換一個），
歷史只取最近幾輪送進 agent，避免 context 無限膨脹。
"""

from collections.abc import Iterator

from sqlalchemy import delete, insert, select

from agents import tutor
from db.engine import engine
from db.tables import chat_messages, videos

# 送進 agent 的歷史訊息上限（一問一答算兩則）
_HISTORY_LIMIT = 20


def list_messages(user_id: int, thread_id: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            select(chat_messages)
            .where(chat_messages.c.user_id == user_id, chat_messages.c.thread_id == thread_id)
            .order_by(chat_messages.c.created_at, chat_messages.c.id)
        )
        return [dict(r._mapping) for r in rows]


def clear_thread(user_id: int, thread_id: str) -> None:
    """清空這條對話串（只刪自己的）。"""
    with engine.begin() as conn:
        conn.execute(
            delete(chat_messages).where(
                chat_messages.c.user_id == user_id,
                chat_messages.c.thread_id == thread_id,
            )
        )


def _save(user_id: int, video_id: int | None, thread_id: str, role: str, content: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            insert(chat_messages).values(
                user_id=user_id,
                video_id=video_id,
                thread_id=thread_id,
                role=role,
                content=content,
            )
        )


def _prepare(user_id: int, thread_id: str, question: str, video_id: int | None) -> list:
    """驗證輸入並回傳要送進 agent 的歷史。錯誤一律丟 ValueError（router 轉 400）。"""
    if not question:
        raise ValueError("請先輸入問題")
    if not thread_id.strip():
        raise ValueError("缺少 thread_id")

    if video_id is not None:
        with engine.connect() as conn:
            owns = conn.execute(
                select(videos.c.id).where(videos.c.id == video_id, videos.c.user_id == user_id)
            ).first()
        if owns is None:
            raise ValueError("找不到這支影片")

    history = [(m["role"], m["content"]) for m in list_messages(user_id, thread_id)]
    return history[-_HISTORY_LIMIT:]


def ask(
    user_id: int,
    thread_id: str,
    question: str,
    video_id: int | None = None,
    context: str = "",
) -> dict:
    question = question.strip()
    history = _prepare(user_id, thread_id, question, video_id)
    answer = tutor.ask(user_id, video_id, history, question, context)

    _save(user_id, video_id, thread_id, "user", question)
    _save(user_id, video_id, thread_id, "assistant", answer)

    return {"thread_id": thread_id, "question": question, "answer": answer}


def ask_stream(
    user_id: int,
    thread_id: str,
    question: str,
    video_id: int | None = None,
    context: str = "",
) -> Iterator[dict]:
    """串流版的 ask。

    驗證在建立 generator **之前**做完（這個函式本身不是 generator），
    所以輸入錯誤仍是一般的 400，而不是串流到一半才報錯。
    整段回答成功才存 DB；中途失敗送 error 事件，問答都不存，使用者重問即可。
    """
    question = question.strip()
    history = _prepare(user_id, thread_id, question, video_id)

    def events() -> Iterator[dict]:
        parts: list[str] = []
        try:
            for event in tutor.stream(user_id, video_id, history, question, context):
                if event["type"] == "delta":
                    parts.append(event["text"])
                yield event
        except Exception as e:  # LLM 連線、額度等錯誤：串流已開始，只能用事件告知
            yield {"type": "error", "message": f"回答失敗：{e}"}
            return

        answer = "".join(parts).strip()
        if not answer:
            yield {"type": "error", "message": "模型沒有回答任何內容，請再問一次"}
            return
        _save(user_id, video_id, thread_id, "user", question)
        _save(user_id, video_id, thread_id, "assistant", answer)
        yield {"type": "done"}

    return events()
