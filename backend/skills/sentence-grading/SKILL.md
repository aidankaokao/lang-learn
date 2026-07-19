---
name: sentence-grading
description: 批改學習者用指定片語造的英文句子，判斷對錯、給修正版本與繁體中文說明，並依結果更新複習排程。當使用者說「幫我看看這句對不對」「我造了一個句子」「批改我的造句」，或需要驗證某個片語有沒有用對時使用。
---

# 造句批改

## 何時用
- 使用者針對**某個已收藏的片語**寫了一個英文句子，要判斷用得對不對時。
- 不用於：整篇作文批改、翻譯、聽寫比對（聽寫走 `dictation` 的 difflib 流程，不是這支）。

## 怎麼做
1. 呼叫 `services.phrase_service.practice(user_id, phrase_id, sentence)`，它會：
   - 交給 `agents/phrase_coach.py`（`task="grade"`）批改
   - 把結果寫進 `phrase_practices`
   - 依 `is_correct` 更新該片語的 SRS 排程（對 → `good`，錯 → `again`）
2. 回傳 `{is_correct, correction, feedback}` 給前端呈現。

## 批改標準（寫在 agent 的 system prompt，改這裡要同步改）
- 文法正確 **且確實用對了指定片語**（用法、語氣、搭配都合理）才算對。
- 片語沒用到、或用法明顯不自然 → `is_correct = false`。
- 只是風格可以更好但沒錯 → `is_correct = true`，在 feedback 給進階建議。
- `feedback` 用繁體中文：先講對錯與原因，再給一個更道地的說法。

## 注意
- **不要為了鼓勵而把錯的說成對的** —— 這條寫在 prompt 裡，調整語氣時不要刪掉。
- 批改結果會影響複習排程，所以 `is_correct` 要謹慎，不確定時傾向判錯並在 feedback 說明理由。
- 每次批改都是獨立呼叫，agent 不帶歷史對話；需要延續討論請走 tutor（階段 4b）。
