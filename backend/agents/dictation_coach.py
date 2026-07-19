"""聽寫教練 agent（LangGraph）。

兩層設計（見 DEVELOPMENT-PLAN.md §3）：
  compare  純程式：difflib 算出 word-level diff 與正確率（穩定、免 token）
  explain  LLM：只解釋「為什麼會聽錯」——連音、弱讀、縮讀、相似音

全對時用條件邊直接跳過 explain，不浪費一次呼叫。
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from llm import get_chat_model
from services import dictation_service

# 幾乎全對就不必解釋了
_SKIP_EXPLAIN_ACCURACY = 0.999

_SYSTEM = """你是英文聽力教練，學生的母語是繁體中文。

學生剛做完一段聽寫，你會拿到「原文」與「他聽錯的地方」。
請解釋**他為什麼會聽錯**，聚焦在語音層面的原因：
- 連音（liaison）、消音（elision）、同化（assimilation）
- 弱讀與縮讀（weak forms、gonna/wanna 之類）
- 相似音、母音長短、字尾子音吞掉
- 語速或重音位置造成的誤判

規則：
- 用繁體中文寫，控制在 150 字以內，講重點不要長篇大論。
- 針對**實際錯的地方**講，不要泛泛而談「多聽多練」。
- 如果錯誤只是拼字或大小寫（發音其實聽對了），要直接指出，不要當成聽力問題。
- 最後給一句具體可執行的建議。"""


class State(TypedDict, total=False):
    user_id: int
    expected: str
    actual: str
    diff: dict
    feedback: str


def compare_node(state: State) -> dict:
    return {"diff": dictation_service.compute_diff(state["expected"], state["actual"])}


def route_after_compare(state: State) -> str:
    return "end" if state["diff"]["accuracy"] >= _SKIP_EXPLAIN_ACCURACY else "explain"


def explain_node(state: State) -> dict:
    llm = get_chat_model(state["user_id"])
    mistakes = dictation_service.summarize_mistakes(state["diff"])

    resp = llm.invoke(
        [
            ("system", _SYSTEM),
            (
                "human",
                f"原文：{state['expected']}\n"
                f"學生聽寫：{state['actual']}\n\n"
                f"錯誤明細：\n{mistakes}",
            ),
        ]
    )
    return {"feedback": str(resp.content).strip()}


builder = StateGraph(State)
builder.add_node("compare", compare_node)
builder.add_node("explain", explain_node)
builder.add_edge(START, "compare")
builder.add_conditional_edges(
    "compare", route_after_compare, {"explain": "explain", "end": END}
)
builder.add_edge("explain", END)

graph = builder.compile()


def grade_dictation(user_id: int, expected: str, actual: str) -> dict:
    """回傳 {diff, feedback}；全對時 feedback 為固定的鼓勵語。"""
    result = graph.invoke({"user_id": user_id, "expected": expected, "actual": actual})
    return {
        "diff": result["diff"],
        "feedback": result.get("feedback") or "完全正確，這段你已經聽得很穩了。",
    }
