# yt-learn 開發計劃書

> 專案細節都放這裡；`CLAUDE.md` 只保留入口與慣例。
> 需求以 `reference/PROJECT-REQUIREMENTS.md` 為準，慣例以 `reference/` 各文件為準。

---

## 1. 這個專案在做什麼

擷取 YouTube 英文影片內容來學習：

- **聽力訓練** — 在介面上用 AB 擷取想練的段落，存成「例句」重複練習。
- **片語管理** — 從文字稿萃取重要片語，含解析、例句、換句話說；可造樣造句由 AI 批改。
- **AI 問答** — 反白文字稿段落發問，或針對片語做引導練習。

---

## 2. 已確認的架構決策

| 項目 | 決定 | 理由 / 代價 |
|---|---|---|
| 文字稿來源 | **使用者手動貼上**（YouTube「顯示轉錄稿」／SRT／VTT） | YouTube 封鎖所有雲端 IP，自動擷取在 Cloud Run 上一定失敗，留著只會製造必然失敗的按鈕 |
| 影音播放 | YouTube IFrame Player API | 不下載、不存音檔，Cloud Run 無儲存負擔；代價是**重播依賴原影片還在且需連網** |
| 帳號 | 帳密 + JWT（`passlib[bcrypt]` / `python-jose`），啟動 seed `admin/admin` | 全開源；admin 可管理其他帳號 |
| LLM provider | 每個使用者在設定頁各自註冊，`api_key` 以 Fernet 加密存 DB、回前端只給遮罩 | 見 `reference/backend/llm-integration.md` §5 |
| 資料庫 | SQLAlchemy Core，初期 SQLite → Cloud Run 換 PostgreSQL | 只改 `DATABASE_URL` |
| 前端風格 | Aurora Glass（極光琉璃），內建 8 套主題盤 | 見 `reference/frontend/frontend-style-aurora-glass.md` |

---

## 3. 例句庫（clips）設計

AB 擷取下來的段落是**與片語同級的練習項目**，不只是播放器書籤。

因為走 IFrame 不下載音訊，一個 clip 存的是**座標 + 文字快照**（`video_id` + `start_ms` / `end_ms` + `text`），
播放時前端 `seekTo(start)` 並在 `end` 跳回。影片若被刪除，文字快照留著但聲音就沒了 —— 這是此方案唯一代價。
若日後需要離線保存，再加「只對已收藏 clip 抽音訊」的選項即可。

### 練習模式
1. **循環聆聽**（列表上直接用）— 例句列表每筆都有耳機鈕，按了就在 A–B 之間無限循環，不必進練習頁。

   手機上有兩個必須遵守的限制，所以例句庫的迷你播放器是**常駐**的（不是點了才出現）：
   - 播放必須發生在**使用者手勢的同一個呼叫堆疊**裡。若等點擊後才建立播放器、
     ready 之後才 `playVideo()`，手勢授權已過期 → **有畫面沒聲音，狀態卻顯示 playing**。
     所以播放器先用第一筆例句開起來，點擊時只呼叫 `loadVideoById`（`useYouTubePlayer.loadVideo`）。
   - 看不見的播放器也會被擋，所以它固定顯示在列表頂端。
2. **盲聽聽寫** — 列表上的鉛筆鈕才進練習頁：遮蔽畫面、打出聽到的內容、difflib 批改。
3. **跟讀 shadowing** — 顯示文字，0.5x / 0.75x 變速（IFrame API 原生支援）。
4. **中文對照** — 每筆例句下方有中文卡，**預設打霧（`blur`）**，點一下才顯示、再點收回。
   建立例句時就在背景先翻好（`translate_quietly`，失敗不影響存檔）；舊例句點下去才即時翻。

### 聽寫批改（兩層，不全交給 LLM）
- **客觀層**：`difflib` 做 word-level diff，標出漏聽 / 錯聽 / 多打並算正確率 —— 穩定、免 token。
- **解釋層**：把 diff 結果餵給 LLM，解釋**為什麼會聽錯**（連音、弱讀、縮讀、相似音）。

clips 與 phrases 共用同一組 SRS 欄位（`ease` / `interval_days` / `due_at` / `review_count`），
練習後照樣更新，目前只用來顯示「練習過幾次」（複習佇列已移除，見 §5）。

### 手機版
斷點用 Tailwind 的 **`lg`（1024px）** 區分：

- **側邊欄**：`lg` 以下改成**抽屜**（Header 左邊的漢堡鈕開啟、點遮罩或換頁自動關），
  `lg` 以上維持常駐、可折疊、可拖曳調寬。`Sidebar` 用 `mobile` prop 切換這兩種行為
  （手機版固定 264px、不折疊、不提供拖曳把手）。
- **Header**：手機顯示漢堡鈕、桌機顯示折疊鈕；帳號 chip 在 `sm` 以下隱藏。
- **學習頁**：雙欄在 `lg` 以下自動堆疊；文字稿卡片手機給 `75vh`（`min-h-[28rem]` 保底），
  桌機才 `sticky` 貼齊視窗高度。
- **學習頁的摺疊**：「這支影片的例句」與「片語萃取」兩張卡片在手機**預設收合**
  （點卡片標題列切換，右側 chevron 指示狀態），把版面留給文字稿。
  實作是同一份 DOM 加 `hidden lg:block`——桌機一律展開，不受 `clipsOpen` / `phrasesOpen` 影響，
  所以不必偵測視窗寬度。「AI 萃取片語」按鈕會 `stopPropagation` 並強制展開，
  免得按下去反而把結果收起來。
- 主內容區留白 `p-4 sm:p-6`；較寬的輸入框都加 `min-w-0` 讓它能縮。

### 清單分頁
影片庫、例句庫、片語庫都是**每頁 5 筆**，共用 `hooks/usePagination.ts` + `components/Pagination.tsx`。
**目前是前端切**（一次載入全部再分頁）：資料量到數百筆都很順，真的成長到數千筆再改成後端 limit/offset。

---

## 4. 資料表（`backend/db/tables.py`）

| 表 | 用途 |
|---|---|
| `users` | 帳號（`role` = admin / user） |
| `llm_providers` | 每人各自註冊的 LLM 設定，`api_key_enc` 加密存 |
| `videos` | 匯入的影片與文字稿狀態（`transcript_status`：pending / ready） |
| `transcript_fragments` | 貼上字幕時的原始細碎片段，保留時間解析度供重新斷句用 |
| `transcript_segments` | 逐句文字稿（`idx` / `start_ms` / `end_ms` / `text`） |
| `clips` | AB 擷取的例句 + SRS 欄位 |
| `clip_practices` | 每次聽寫紀錄（輸入、正確率、diff、LLM 回饋） |
| `phrases` | 片語 + 解析 / 例句 / 換句話說 + SRS 欄位 |
| `phrase_practices` | 造樣造句的批改紀錄 |
| `chat_messages` | tutor agent 的問答紀錄 |

---

## 5. LangGraph agents（`backend/agents/`）

| Agent | 圖結構 | 職責 |
|---|---|---|
| `phrase_extractor` | load → extract → filter | 文字稿切段萃取片語，去重並排除已收藏 |
| `phrase_coach` | START 條件分流 → explain / grade | 產生解析／例句／換句話說；批改造樣造句 |
| `dictation_coach` | compare →（條件邊）explain | difflib 比對算正確率；只有錯了才呼叫 LLM 解釋 |
| `tutor` | agent ⇄ tools（ReAct） | 反白段落問答，tool 綁定 user_id/video_id 防越權 |

> **已移除**：`study_planner` 與「今日複習」頁 —— 開發者回饋這種每日待辦式的介面讓學習變得像作業。
> SRS 欄位（`ease` / `interval_days` / `due_at` / `review_count`）仍會在練習後更新，
> 目前只用來顯示「練習過幾次」，之後若要做熟練度視覺化可以直接接上。

**tutor 的 tools**：`search_transcript`（查證原文，避免編造）、`list_my_phrases`、`save_phrase`。
tool 用 closure 綁死 `user_id` / `video_id`，LLM 沒有機會存取別人的資料。

### 懸浮 AI 助理（全站）
右下角的懸浮鈕 + 反白工具列掛在 `AppLayout`，所以**登入後每一頁都有**。

- **對話串跟著頁面走**（`lib/thread.ts` 的 `resolveThread`）：影片頁 `video-<id>`、
  例句練習頁 `clip-<id>`、其餘各頁一條（`videos` / `clips` / `phrases` / `general`）。
  影片頁刻意沿用原本學習頁的 thread id，舊紀錄不會不見。
- **只有影片頁會帶 `video_id`**，因為那時 tutor 才能用 `search_transcript` 查證原文。
- **反白工具列**：反白任何文字就地浮出「問 AI」；
  「收藏片語」只在學習頁出現 —— 由 StudyPage 在掛載時把 handler 註冊進
  `stores/assistant.ts`，工具列本身不需要知道自己在哪一頁。
- 學習頁原本的問答卡片與反白列已移除，統一走懸浮視窗，避免兩個入口做同一件事。

Skills（`backend/skills/`，各含 `SKILL.md`）：`phrase-extraction`、`sentence-grading`、`dictation`。

**SRS 排程規則只有一份**：`services/srs_service.py`（SM-2 精簡版），phrases 與 clips 共用。
`quality` 為 `again` / `hard` / `good` / `easy`；聽寫另有 `quality_from_accuracy()` 由正確率自動換算。

---

## 6. 建置階段

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | 骨架 + DB + 帳號登入註冊 + admin seed + 帳號管理頁 | ✅ 完成 |
| 2 | LLM provider 設定頁 + `get_chat_model()` 工廠（後續 AI 功能的前置） | ✅ 完成 |
| 3 | 影片匯入 + 文字稿擷取 + 學習頁播放器與 AB 循環擷取 | ✅ 完成 |
| 4a | 片語萃取／解析／收藏／造樣造句批改（LangGraph + SRS + skills） | ✅ 完成 |
| 4b | 聽寫批改（difflib + LLM 解釋）+ tutor 問答 + 今日複習佇列 | ✅ 完成 |
| 5 | Docker compose 對齊 + Cloud Run 部署文件（含 Postgres 切換） | ✅ 完成 |

---

## 7. 目前的 API

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/health` | 健康檢查 |
| POST | `/api/auth/register` | 註冊（`ALLOW_REGISTRATION=false` 時關閉）→ 回 token |
| POST | `/api/auth/login` | 登入 → 回 token |
| GET | `/api/auth/me` | 目前使用者 |
| POST | `/api/auth/change-password` | 改自己的密碼（需驗證舊密碼） |
| GET | `/api/settings/llm-providers` | 列出自己註冊的 provider（key 只給遮罩） |
| POST | `/api/settings/llm-providers` | 新增（第一筆自動設為使用中） |
| PUT | `/api/settings/llm-providers/{id}` | 編輯（`api_key` 留空 = 不更動原本的 key） |
| PUT | `/api/settings/llm-providers/{id}/active` | 設為使用中（同時只有一筆） |
| POST | `/api/settings/llm-providers/{id}/test` | 實際呼叫一次模型測試連線 |
| DELETE | `/api/settings/llm-providers/{id}` | 刪除（若刪掉的是使用中那筆，自動補上下一筆） |
| GET | `/api/videos` | 影片列表 |
| POST | `/api/videos` | 貼網址匯入（回 `transcript_status=pending`，等使用者貼字幕） |
| GET | `/api/videos/{id}` | 單支影片 |
| GET | `/api/videos/{id}/segments` | 逐句文字稿 |
| POST | `/api/videos/{id}/transcript` | 手動貼上字幕（SRT／VTT／轉錄稿面板） |
| POST | `/api/videos/{id}/resegment` | AI 重新斷句成一句一段 |
| DELETE | `/api/videos/{id}` | 刪除影片與其所有衍生資料 |
| GET | `/api/clips?video_id=` | 例句列表 |
| POST | `/api/clips` | 存 AB 段落（`text` 留空會自動從文字稿抓快照） |
| PATCH | `/api/clips/{id}` | 改標籤 / 文字 / 筆記 |
| DELETE | `/api/clips/{id}` | 刪除例句 |
| GET | `/api/phrases?video_id=` | 片語列表 |
| POST | `/api/phrases/extract` | AI 從影片文字稿萃取候選片語（**不直接存**，由使用者挑） |
| POST | `/api/phrases` | 收藏片語（`explain=true` 會同步產生解析） |
| POST | `/api/phrases/{id}/explain` | 重新產生解析 |
| POST | `/api/phrases/{id}/practice` | 造樣造句批改 + 更新 SRS |
| GET | `/api/phrases/{id}/practices` | 過去的造句紀錄 |
| POST | `/api/phrases/{id}/review` | 純自評複習（`quality`: again/hard/good/easy） |
| DELETE | `/api/phrases/{id}` | 刪除片語與其練習紀錄 |
| GET | `/api/clips/{id}` | 單筆例句（練習頁用） |
| GET | `/api/clips/{id}/practices` | 練習紀錄 |
| POST | `/api/clips/{id}/translate` | 產生中文對照（`force=true` 重翻）；建立例句時已在背景先做 |
| POST | `/api/clips/{id}/dictation` | 聽寫批改：difflib 正確率 + LLM 解釋 + 更新 SRS |
| POST | `/api/clips/{id}/review` | 跟讀自評（`quality`），只更新排程 |
| GET | `/api/chat?thread_id=` | 某條對話串的問答紀錄 |
| POST | `/api/chat` | 問 tutor（可帶 `video_id` 與反白的 `context`） |
| DELETE | `/api/chat?thread_id=` | 清空該對話串 |
| GET | `/api/admin/users` | 列出所有帳號（admin） |
| POST | `/api/admin/users` | 建立帳號（admin） |
| PATCH | `/api/admin/users/{id}` | 啟用停用 / 改角色（admin） |
| POST | `/api/admin/users/{id}/password` | 重設密碼（admin） |
| DELETE | `/api/admin/users/{id}` | 刪除帳號與其所有學習資料（admin） |

保護規則：不能停用／降級／刪除自己，也不能刪掉最後一位管理員。

---

## 8. 部署

兩種部署方式並存，**image 不同、不要混用**：

| 場景 | 檔案 | 架構 |
|---|---|---|
| 內網 / 自架機器 | `Dockerfile.backend` + `Dockerfile.frontend` + `docker-compose.yaml` + `build.sh` | nginx（前端 + 反代 `/api`）＋ backend 兩個容器，掛在 `/<APP_ROUTE>/` |
| **Cloud Run** | `Dockerfile.cloudrun` | **單一容器**：前端 build 成靜態檔由 FastAPI 直接伺服，掛在 `/` |

單一容器的關鍵在 `api.py` 底部：偵測到 `backend/static` 存在才 mount 靜態檔與 SPA fallback，
所以本機開發（沒有那個目錄）行為完全不變。catch-all 註冊在所有 `/api` 路由之後，不會蓋掉 API。

**Cloud Run 的完整介面操作步驟見 `DEPLOY-CLOUDRUN.md`**，其中三個最容易踩雷的點：
1. **容器連接埠要改成 8000**（`api.py` 寫死），不是預設的 8080。
2. **CPU 配置建議選「一律配置」**：例句的中文對照是用 `BackgroundTasks` 在回應後才跑的，
   「僅在要求處理期間配置 CPU」會讓它被凍結（點開中文卡時仍會即時補翻，不影響使用）。
3. **SQLite 不能用**（檔案系統是暫時性的），資料庫用 **Neon**（serverless PostgreSQL，
   免費方案閒置不計費）。切換資料庫只改 `DATABASE_URL`，程式不動。

`DEPLOY-CLOUDRUN.md` 刻意**只寫一條路徑**（全程 GCP 介面 + GitHub 自動建置 + Neon），
不列其他替代方案，避免實際操作時搞混。

---

## 9. 已知待辦與注意事項

- **本機 Python 版本**：慣例固定 3.11，但開發機目前只有 3.12 / 3.13。程式碼避開 3.12+ 專屬語法，容器基底仍是 `python:3.11-slim`。
- **正式環境務必改掉** `backend/.env` 的 `JWT_SECRET`、`ADMIN_PASSWORD`，並設定固定的 `ENCRYPTION_KEY`
  （否則換 `JWT_SECRET` 會導致已存的 `api_key` 解不開）。
- 公開部署前建議把 `ALLOW_REGISTRATION` 設成 `false`，改由管理員建帳號。
- SQLite → PostgreSQL 時需 `pip install "psycopg[binary]"` 並改 `DATABASE_URL`（見 `reference/backend/database.md` §6）。
- **自動擷取字幕已移除**：YouTube 封鎖所有雲端供應商的 IP，`youtube-transcript-api`
  與 `yt-dlp` 在 Cloud Run 上一律 `RequestBlocked`。文字稿改為使用者從
  YouTube「顯示轉錄稿」複製貼上（`transcript_service.parse_manual_transcript()`，
  支援 SRT／VTT／轉錄稿面板三種格式）。相關依賴也一併移除了。

### 字幕時間軸與段落重疊
YouTube **自動字幕是滾動式的**：相鄰片段時間大幅重疊、文字重複。段落重疊會造成兩個症狀
（都已修掉，但**舊資料要按「重試」重抓才會套用**）：

1. **高亮跳到上一段**：原本用 `findIndex` 找「第一個包含目前時間的段落」，
   重疊時永遠先命中上一段。改成取「開始時間在目前播放點之前的**最後一段**」。
2. **AB 擷取吃到上一段的尾巴**：原本只要 overlap > 0 就納入。
   改成要求重疊 ≥ `min(500ms, 段落長度的一半)`，前後端都套同一條規則
   （`StudyPage.saveClip` 與 `clip_service._snapshot_text`）。
- 後端 `_normalize_fragments()` 會去掉重複文字，並把每段結束時間夾到「下一段的開始」，消掉重疊造成的往後飄移。
- 仍對不齊時，學習頁有**字幕偏移微調**（±0.5 秒一格，上限 ±10 秒），每支影片各自存在瀏覽器
  `localStorage['yt-learn-offset-<videoId>']`。
- **偏移只存在前端**，所以存 clip 時文字快照改由前端算好再送（`POST /api/clips` 的 `text`），
  否則後端會用沒校正的時間去抓句子。
- 沒有存進資料庫是刻意的：偏移屬於個人校正，放 localStorage 夠用。

### 結構變更（加欄位）
`metadata.create_all()` **不會修改既有的表**，所以在 `tables.py` 加欄位後，既有的 SQLite 檔不會跟著長。
啟動時會跑 `db/migrate.py` 的 `add_missing_columns()` 自動 `ALTER TABLE ADD COLUMN` 補上。

**限制（刻意保守）**：只加欄位，不改型別／不刪欄位／不改約束，而且只處理「可為 NULL 且沒有 server_default」的欄位。
其他情況會印訊息請開發者手動處理。正式環境請改用 Alembic（見 `reference/backend/database.md` §7）。

### 文字轉語音（片語庫）
用 **微軟 Edge 的 Neural 語音**，透過開源套件 `edge-tts`（MIT、免金鑰、免費）。
- 後端 `services/tts_service.py` + `routers/tts.py`（`POST /api/tts` 回 mp3、`GET /api/tts/voices` 給清單）。
- **預設 `en-GB-SoniaNeural`（英國腔）**，可在設定頁換；選擇存瀏覽器 localStorage。
- 合成結果依「文字＋語音＋語速」快取到 `backend/data/tts/*.mp3`，同一句不會重複合成。
  **目前沒有清理機制**，長期使用要留意這個目錄的大小。
- **為什麼不用瀏覽器內建的 Web Speech API**：微軟語音是 Windows 的系統語音，
  Linux / macOS 的瀏覽器拿不到，Linux 上通常只剩 espeak（機械音）。走後端則不分作業系統。
- **風險**：`edge-tts` 走的是微軟未公開的端點，對方若改動或封鎖就會失效
  （後端回 502）。前端會自動退回瀏覽器語音並提示使用者。真要完全自主得改用 Piper / Coqui。

### 文字稿的已知限制
- 字幕碎片會**合併成接近句子的段落**，斷句條件有三個（`_merge_into_sentences`）：
  遇到句末標點、**說話停頓 ≥ 700ms**、或滿 8 秒／160 字。
  **自動字幕沒有標點**，所以停頓是主要線索——只靠長度上限一定會切在句子中間。
- 仍然斷得不好時，學習頁的文字稿有 **「重新斷句」**，做到**一句一段**。
  難點在於「句子結束在第幾秒」表面上無從得知——自動字幕的片段不會剛好切在句尾。
  解法是**字級時間內插**（`resegment_with_llm`）：
  1. `transcript_fragments` 保留最初的細碎片段（這就是這張表存在的理由）
  2. 每個片段依字數平均內插，攤平成「每個字的估計時間」（`_build_word_timeline`）
  3. LLM 只負責補標點與斷句，**嚴禁改字**
  4. 把句子的字對回時間軸（`_align_sentences`，容許輕微改字時往後找 6 格重新同步）

  誤差約 ±0.2–0.3 秒。對齊涵蓋率 < 80% 會直接報錯並保留原文字稿，不會弄壞資料。
  重新斷句會清掉 `phrases.segment_id` 的關聯（段落 id 會變），但片語本身與例句都不受影響。

> **`transcript_fragments` 是新表**，`metadata.create_all()` 會自動建立。
> 但**舊影片沒有片段資料**，重新斷句會退回用現有段落內插（時間解析度較差）。
> 要最佳效果就重新匯入或重貼一次字幕。

