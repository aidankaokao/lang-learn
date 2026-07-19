---
name: phrase-extraction
description: 從英文影片文字稿中挑出值得學的片語（片語動詞、慣用語、搭配詞、口語表達），並過濾掉使用者已收藏的。當使用者說「幫我從這支影片找片語」「這段有什麼值得學的說法」「萃取重點片語」，或需要把文字稿轉成可學習的片語清單時使用。
---

# 片語萃取

## 何時用
- 使用者有一份**已擷取好的英文文字稿**，想從中找出值得收藏學習的片語時。
- 不用於：單一片語的解析（用 `sentence-grading` 旁邊的 phrase_coach）、翻譯整篇文章、摘要影片內容。

## 怎麼做
1. 呼叫 `services.phrase_service.extract_candidates(user_id, video_id)`，它會：
   - 取出該影片的完整文字稿（`transcript_segments` 依 `idx` 串接）
   - 交給 `agents/phrase_extractor.py` 的 LangGraph（load → extract → filter）
   - 回傳候選清單 `[{text, meaning, difficulty}]`
2. **不要直接寫進資料庫**。候選清單交給使用者挑選，選中的才呼叫
   `phrase_service.create_phrase(...)` 收藏。
3. 收藏時 `explain=True` 會同步產生解析（語意 / 用法 / 例句 / 換句話說），會多花幾秒。
   批次收藏多筆時建議 `explain=False`，之後再逐筆呼叫 `/phrases/{id}/explain`。

## 挑選原則（寫在 agent 的 system prompt，改這裡要同步改）
- 優先挑「道地但台灣學習者不容易自己想到」的表達。
- 不挑單一簡單單字、不挑整句話、不挑專有名詞。
- 每段最多 8 個，寧缺勿濫。
- `text` 必須是文字稿中實際出現的形式，不自行還原成原形。

## 注意
- 文字稿會切成 6000 字元一段、最多處理 6 段（見 `agents/phrase_extractor.py` 的
  `_CHUNK_CHARS` / `_MAX_CHUNKS`）。**超長影片只會看前面幾段**，要調整就改這兩個常數。
- 去重是比對小寫後的字串，只能擋完全相同的；語意重複（如 `run into` / `ran into`）擋不掉。
- 使用者沒設定 LLM provider 時會丟 `ValueError`，讓它往上冒到 router 轉成 400，不要吞掉。
