"""聽寫比對（客觀層）。

刻意**不交給 LLM**：對錯與正確率用 difflib 算，穩定、可重現、免 token。
LLM 只負責解釋「為什麼會聽錯」（見 agents/dictation_coach.py）。
"""

import re
from difflib import SequenceMatcher

# 比對前的正規化：小寫、去標點（保留縮寫的單引號）、壓空白
_PUNCT = re.compile(r"[^a-z0-9'\s]")
_APOSTROPHE = re.compile(r"[‘’ʼ]")


def normalize(text: str) -> list[str]:
    text = _APOSTROPHE.sub("'", text.lower())
    text = _PUNCT.sub(" ", text)
    return text.split()


def compute_diff(expected_text: str, input_text: str) -> dict:
    """回傳 word-level 差異與正確率。

    ops 的每一項是 {op, expected, actual}：
      equal   聽對了
      wrong   聽錯（位置對但字不同）
      missing 漏聽
      extra   多打
    """
    expected = normalize(expected_text)
    actual = normalize(input_text)

    ops: list[dict] = []
    correct = 0

    for tag, i1, i2, j1, j2 in SequenceMatcher(None, expected, actual).get_opcodes():
        exp_chunk = expected[i1:i2]
        act_chunk = actual[j1:j2]
        if tag == "equal":
            correct += len(exp_chunk)
            ops.append({"op": "equal", "expected": exp_chunk, "actual": act_chunk})
        elif tag == "replace":
            ops.append({"op": "wrong", "expected": exp_chunk, "actual": act_chunk})
        elif tag == "delete":
            ops.append({"op": "missing", "expected": exp_chunk, "actual": []})
        elif tag == "insert":
            ops.append({"op": "extra", "expected": [], "actual": act_chunk})

    accuracy = correct / len(expected) if expected else 0.0

    return {
        "accuracy": round(accuracy, 4),
        "ops": ops,
        "expected_word_count": len(expected),
        "correct_word_count": correct,
    }


def summarize_mistakes(diff: dict) -> str:
    """把 diff 濃縮成一段給 LLM 讀的描述（只列錯的地方，省 token）。"""
    lines: list[str] = []
    for op in diff["ops"]:
        if op["op"] == "equal":
            continue
        expected = " ".join(op["expected"]) or "（無）"
        actual = " ".join(op["actual"]) or "（無）"
        if op["op"] == "wrong":
            lines.append(f"- 原文「{expected}」→ 使用者聽成「{actual}」")
        elif op["op"] == "missing":
            lines.append(f"- 漏聽了「{expected}」")
        else:
            lines.append(f"- 多打了「{actual}」")
    return "\n".join(lines) or "（完全正確）"
