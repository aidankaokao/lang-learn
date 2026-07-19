"""Tutor agent（LangGraph ReAct）。

反白文字稿發問、或針對片語追問時使用。典型結構：
  agent（LLM 決策）→ 有 tool call 就去 tools 再回 agent，否則到 END

tool 需要知道「是誰、在看哪支影片」，所以用 closure 在每次請求時綁定 user_id / video_id，
再 compile 一張圖。圖很小，建圖成本遠低於一次 LLM 呼叫。
"""

from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from llm import get_chat_model

_SYSTEM = """你是英文學習教練，學生的母語是繁體中文，正在看一支英文影片學習。

原則：
- 用繁體中文解釋，英文例句與原文保持英文。
- 解釋要具體：講清楚語意、語氣、使用情境，不要只給翻譯。
- 學生問某段話的意思時，先直翻再說明言外之意或文化脈絡。
- 需要引用影片內容時，用 search_transcript 查證，**不要憑印象編造原文**。
- 學生想收藏某個說法時，用 save_phrase 幫他存進片語庫。
- 回答控制在 300 字內，除非學生要求詳細說明。"""


class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


def build_tools(user_id: int, video_id: int | None):
    """把 user_id / video_id 綁進 tool，避免 LLM 有機會存取別人的資料。"""
    from services import phrase_service, video_service

    @tool
    def search_transcript(query: str) -> str:
        """在目前這支影片的文字稿中搜尋關鍵字，回傳相符的句子與時間點。"""
        if video_id is None:
            return "目前沒有指定影片，無法搜尋文字稿。"
        segments = video_service.get_segments(user_id, video_id)
        needle = query.strip().lower()
        hits = [s for s in segments if needle in s["text"].lower()][:8]
        if not hits:
            return f"文字稿中找不到「{query}」。"
        return "\n".join(f"[{s['start_ms'] // 1000}s] {s['text']}" for s in hits)

    @tool
    def list_my_phrases() -> str:
        """列出學生已收藏的片語，用來判斷他學過什麼、避免重複解釋。"""
        items = phrase_service.list_phrases(user_id)[:50]
        if not items:
            return "學生還沒有收藏任何片語。"
        return "\n".join(f"- {p['text']}：{p['meaning'] or '（尚未解析）'}" for p in items)

    @tool
    def save_phrase(text: str) -> str:
        """把一個英文片語收藏進學生的片語庫。只在學生明確表示想記下來時使用。"""
        try:
            # explain=False：對話中先存起來，詳細解析讓他之後在片語庫按「重新解析」
            phrase_service.create_phrase(user_id, text=text, video_id=video_id, explain=False)
            return f"已收藏「{text}」。"
        except ValueError as e:
            return f"收藏失敗：{e}"

    return [search_transcript, list_my_phrases, save_phrase]


def build_graph(user_id: int, video_id: int | None, context: str = ""):
    tools = build_tools(user_id, video_id)
    llm = get_chat_model(user_id).bind_tools(tools)

    system = _SYSTEM
    if context:
        system += f"\n\n學生目前反白的文字稿片段是：\n「{context}」"

    def agent_node(state: State) -> dict:
        resp = llm.invoke([SystemMessage(content=system), *state["messages"]])
        return {"messages": [resp]}

    builder = StateGraph(State)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", ToolNode(tools))
    builder.add_edge(START, "agent")
    # tools_condition：有 tool call 就去 tools，否則收工
    builder.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: END})
    builder.add_edge("tools", "agent")
    return builder.compile()


def ask(
    user_id: int,
    video_id: int | None,
    history: list[tuple[str, str]],
    question: str,
    context: str = "",
) -> str:
    """history 是 [(role, content)]，role 為 user / assistant。"""
    graph = build_graph(user_id, video_id, context)
    messages = [*history, ("user", question)]
    result = graph.invoke({"messages": messages})
    return str(result["messages"][-1].content).strip()
