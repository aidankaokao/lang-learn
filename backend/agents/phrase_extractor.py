"""片語萃取 agent（LangGraph）。

流程：load（取文字稿與已收藏片語）→ extract（逐段丟 LLM）→ filter（去重）→ END

文字稿可能很長，load 會切成數段、extract 逐段萃取再匯總，
避免一次塞爆 context，也讓長影片的後半段不會被忽略。
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from agents.schemas import PhraseCandidates
from llm import get_chat_model

# 單段文字上限與最多處理段數（控制成本；超過會在結果裡註明只看了前面幾段）
_CHUNK_CHARS = 6000
_MAX_CHUNKS = 6

_SYSTEM = """你是英文學習教練，正在幫台灣學習者從影片文字稿中挑出值得學的片語。

挑選原則：
- 優先挑「道地但台灣學習者不容易自己想到」的表達：片語動詞、慣用語、搭配詞、口語表達。
- 不要挑單一的簡單單字（如 make、good），也不要挑整句話。
- 不要挑專有名詞、人名、產品名。
- 每段最多挑 8 個，寧缺勿濫。
- text 必須是文字稿中實際出現的形式，不要自行改寫或還原成原形。"""


class State(TypedDict):
    user_id: int
    transcript: str
    existing: list[str]
    chunks: list[str]
    candidates: list[dict]


def load_node(state: State) -> dict:
    """把文字稿切段。"""
    text = state["transcript"]
    chunks = [text[i : i + _CHUNK_CHARS] for i in range(0, len(text), _CHUNK_CHARS)]
    return {"chunks": chunks[:_MAX_CHUNKS]}


def extract_node(state: State) -> dict:
    """逐段請 LLM 萃取候選片語。"""
    llm = get_chat_model(state["user_id"]).with_structured_output(PhraseCandidates)

    found: list[dict] = []
    for chunk in state["chunks"]:
        result = llm.invoke(
            [
                ("system", _SYSTEM),
                ("human", f"以下是影片文字稿的一段，請挑出值得學的片語：\n\n{chunk}"),
            ]
        )
        found.extend(item.model_dump() for item in result.items)
    return {"candidates": found}


def filter_node(state: State) -> dict:
    """去掉重複的，以及使用者已經收藏過的。"""
    existing = {t.strip().lower() for t in state["existing"]}
    seen: set[str] = set()
    kept: list[dict] = []

    for item in state["candidates"]:
        key = item["text"].strip().lower()
        if not key or key in seen or key in existing:
            continue
        seen.add(key)
        kept.append(item)

    return {"candidates": kept}


builder = StateGraph(State)
builder.add_node("load", load_node)
builder.add_node("extract", extract_node)
builder.add_node("filter", filter_node)
builder.add_edge(START, "load")
builder.add_edge("load", "extract")
builder.add_edge("extract", "filter")
builder.add_edge("filter", END)

graph = builder.compile()


def extract_phrases(user_id: int, transcript: str, existing: list[str]) -> list[dict]:
    """給 service 層用的薄包裝。"""
    result = graph.invoke(
        {"user_id": user_id, "transcript": transcript, "existing": existing, "candidates": []}
    )
    return result["candidates"]
