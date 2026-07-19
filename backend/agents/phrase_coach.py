"""片語教練 agent（LangGraph）。

一張圖兩種任務，從 START 用條件邊分流：
  task="explain" → 產生語意 / 用法解析 / 例句 / 換句話說
  task="grade"   → 批改使用者的造樣造句

兩者共用同一個 state 與 LLM 建構方式，之後要加「出練習題」之類的任務再接一個 node 即可。
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from agents.schemas import PhraseExplanation, SentenceGrading
from llm import get_chat_model

_EXPLAIN_SYSTEM = """你是英文學習教練，服務對象是母語為繁體中文的台灣學習者。

解析一個片語時：
- meaning 用繁體中文，一句話講清楚。
- explanation 說明語氣（正式/口語）、典型使用情境、常見搭配、容易誤用的地方。
- examples 給 3 個英文例句，情境要具體、貼近日常或職場，不要造作。
- paraphrases 給 3 個英文的換句話說，並盡量涵蓋不同正式程度。
- 全部用繁體中文書寫說明部分，例句與換句話說用英文。"""

_GRADE_SYSTEM = """你是英文寫作老師，正在批改學習者的造樣造句。

判斷標準：
- 文法正確，且**確實用對了指定片語**（用法、語氣、搭配都要合理）。
- 片語沒用到、或用法明顯不自然 → is_correct = false。
- 只是風格可以更好、但沒有錯 → is_correct = true，並在 feedback 給進階建議。

correction 給修正後的句子（本來就對就回原句）。
feedback 用繁體中文，先講對錯與原因，再給一個更道地的說法。語氣鼓勵但要誠實，不要為了鼓勵而說錯的是對的。"""


class State(TypedDict, total=False):
    task: str  # explain | grade
    user_id: int
    phrase: str
    context: str  # 片語出現的原句，可省略
    sentence: str  # grade 時使用者寫的句子
    explanation: dict
    grading: dict


def route(state: State) -> str:
    task = state.get("task", "explain")
    if task not in ("explain", "grade"):
        raise ValueError(f"未知的任務：{task}")
    return task


def explain_node(state: State) -> dict:
    llm = get_chat_model(state["user_id"]).with_structured_output(PhraseExplanation)
    context = state.get("context") or ""
    human = f"請解析這個英文片語：{state['phrase']}"
    if context:
        human += f"\n\n它在影片中的原句是：{context}"

    result = llm.invoke([("system", _EXPLAIN_SYSTEM), ("human", human)])
    return {"explanation": result.model_dump()}


def grade_node(state: State) -> dict:
    llm = get_chat_model(state["user_id"]).with_structured_output(SentenceGrading)
    result = llm.invoke(
        [
            ("system", _GRADE_SYSTEM),
            (
                "human",
                f"指定片語：{state['phrase']}\n"
                f"學習者寫的句子：{state['sentence']}\n\n請批改。",
            ),
        ]
    )
    return {"grading": result.model_dump()}


builder = StateGraph(State)
builder.add_node("explain", explain_node)
builder.add_node("grade", grade_node)
builder.add_conditional_edges(START, route, {"explain": "explain", "grade": "grade"})
builder.add_edge("explain", END)
builder.add_edge("grade", END)

graph = builder.compile()


def explain_phrase(user_id: int, phrase: str, context: str = "") -> dict:
    result = graph.invoke(
        {"task": "explain", "user_id": user_id, "phrase": phrase, "context": context}
    )
    return result["explanation"]


def grade_sentence(user_id: int, phrase: str, sentence: str) -> dict:
    result = graph.invoke(
        {"task": "grade", "user_id": user_id, "phrase": phrase, "sentence": sentence}
    )
    return result["grading"]
