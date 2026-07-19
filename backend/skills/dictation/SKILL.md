---
name: dictation
description: 批改英文聽寫：用 difflib 做 word-level 比對算出正確率，再由 LLM 解釋為什麼會聽錯（連音、弱讀、縮讀、相似音）。當使用者說「我聽寫完了」「幫我看看聽到的對不對」「為什麼我聽不出這句」，或需要比對聽寫輸入與原文時使用。
---

# 聽寫批改

## 何時用
- 使用者針對一個**已收藏的聽力例句（clip）**輸入了他聽到的內容時。
- 不用於：造句批改（走 `sentence-grading`）、翻譯、文法檢查整段文章。

## 怎麼做
1. 呼叫 `services.clip_service.dictation(user_id, clip_id, input_text)`，它會：
   - 用 `services/dictation_service.py` 的 `compute_diff()` 算出 word-level 差異與正確率
   - 交給 `agents/dictation_coach.py`（compare → explain）產生解釋
   - 寫入 `clip_practices`，並依正確率更新該 clip 的 SRS 排程
2. 回傳 `{accuracy, diff_json, feedback, expected_text}` 給前端呈現。

## 兩層設計（重要，不要合併成一次 LLM 呼叫）
| 層 | 做什麼 | 為什麼 |
|---|---|---|
| **客觀層** `dictation_service` | difflib 比對，標出 equal / wrong / missing / extra 並算正確率 | 穩定、可重現、免 token；LLM 算正確率會亂飄 |
| **解釋層** `dictation_coach` | 只解釋「為什麼聽錯」 | 這才是 LLM 有價值的地方 |

正確率 ≥ 0.999 時，agent 的條件邊會**直接跳過 LLM**，不浪費呼叫。

## 比對規則
- 正規化：轉小寫、去標點（保留縮寫的單引號）、壓空白（見 `dictation_service.normalize`）。
- 因此**大小寫與標點不算錯**，拼字錯才算錯。
- 正確率 = 完全相符的字數 ÷ 原文字數。

## 解釋的要求（寫在 agent 的 system prompt）
- 聚焦語音層面：連音、消音、同化、弱讀縮讀、相似音、字尾子音吞掉。
- 繁體中文、150 字內、針對**實際錯的地方**，不要泛泛說「多聽多練」。
- 只是拼字錯（發音其實聽對了）要直接指出，不要當成聽力問題。

## 注意
- clip 沒有 `text`（文字稿快照）時無法比對，service 會丟 `ValueError`，讓使用者先補上文字。
- 正確率 → SRS 評分的換算在 `srs_service.quality_from_accuracy()`：
  ≥0.95 easy、≥0.85 good、≥0.60 hard、其餘 again。要調難度就改那裡。
