<!--
  這是「新專案根目錄」用的 CLAUDE.md 範本。
  用法：把 backend/ frontend/ deploy/ 放進新專案的 reference/ 後，
  把這份檔複製到【新專案根目錄】並改名為 CLAUDE.md。
  Claude Code 啟動時會自動讀取根目錄 CLAUDE.md，於是每個新 session
  一開就會照下面指示去讀 reference/ 裡的慣例，你只要講需求即可。
-->

# 專案開發指引（本專案的開發慣例入口）

> 我把常用的開發框架與注意事項放在 **`reference/`** 資料夾（`reference/backend`、`reference/frontend`、`reference/deploy`）。
> **動工前務必依序讀：**
> 1. **`reference/PROJECT-REQUIREMENTS.md`** —— 本專案的需求（我已填寫）。
> 2. **`DEVELOPMENT-PLAN.md`** —— 已確認的架構決策、資料表、agent 設計、階段進度（**專案細節都在這**）。
> 3. 下方「文件地圖」中對應的細節文件（都在 `reference/`）。
>
> 部署到 Cloud Run 的介面操作步驟另見 **`DEPLOY-CLOUDRUN.md`**。
>
> **一律照 `reference/` 的慣例做，不要自行發明架構或風格；需求以 `PROJECT-REQUIREMENTS.md` 為準。**

---

## ⚠️ 開工前確認清單 —— **本專案已全部確認完畢，不用再問**

已確認的答案（細節與理由見 `DEVELOPMENT-PLAN.md` §2）：

1. **要前端** → **Aurora Glass**；LLM provider 走**前端設定頁註冊**，每個使用者各自註冊自己的 key。
2. **要 AI agent** → LangGraph（`phrase_extractor` / `tutor` / `phrase_coach` / `study_planner`）。
3. **要 LLM** → `ChatOpenAI`（外部 OpenAI），設定從 DB 讀。
4. **要資料庫** → SQLAlchemy Core，初期 SQLite → Cloud Run 換 PostgreSQL。
5. **暫時不出 Docker 部署** → 階段 5 才做，屆時另寫 Cloud Run 部署文件。

其他已確認：文字稿由**使用者手動貼上**（YouTube 封鎖雲端 IP，無法自動擷取）；播放走 **YouTube IFrame Player API**（不下載音檔）；帳號為帳密 JWT，預設管理員 `admin/admin`。

<details>
<summary>原始確認題目（新專案沿用此模板時參考）</summary>

需求給你後，**先問清楚以下幾點再動工**（這些會決定你要讀哪些 reference 文件、怎麼搭）：

1. **要不要前端？**
   - 要 → 用哪種視覺風格？**Formal（乾淨後台）/ Glass Wave（玻璃波）/ Aurora Glass（極光琉璃）** 三選一（見 `reference/frontend/`）。
   - 要 → LLM provider 設定就走「**前端設定頁註冊多個**」（見 `reference/backend/llm-integration.md` §5）。
   - 不要（純後端 / CLI / 服務）→ LLM / 設定走 **`.env`**（同文件 §2）。
2. **要不要 AI agent？** 要 → 用 LangGraph（`reference/backend/langgraph-agent.md`）。
3. **要不要用到 LLM？** 要 → `ChatOllama`（本地 Ollama）/ `ChatOpenAI`（外部 OpenAI 或本地 vLLM）（`reference/backend/llm-integration.md`）。
4. **要不要資料庫？** 要 → SQLAlchemy Core，初期 SQLite、之後換 PostgreSQL（`reference/backend/database.md`）。
5. **要不要現在就出 Docker 部署？** 要 → 照 `reference/deploy/deploy-guide.md`。

> 我沒特別講的部分，一律以 `reference/` 文件的慣例為預設，不要另立一套。

</details>

---

## 文件地圖（都在 `reference/`）

| 面向 | 文件 |
|---|---|
| 前端風格（三選一）| `reference/frontend/frontend-style-formal.md`、`…-glass-wave.md`、`…-aurora-glass.md` |
| 前後端接線（dev proxy / nginx / API client）| `reference/frontend/frontend-backend-integration.md` |
| 後端入口 / FastAPI | `reference/backend/backend-conventions.md` |
| AI Agent（LangGraph）| `reference/backend/langgraph-agent.md` |
| LLM 串接 | `reference/backend/llm-integration.md` |
| 資料庫 | `reference/backend/database.md` |
| Skill 設計 | `reference/backend/skill-design.md` |
| 部署（Docker Compose）| `reference/deploy/deploy-guide.md` |
| 起手檔範本 | `reference/` 各資料夾內的 `*.example` / `package.json` / `vite.config.ts` / `requirements.txt` / `nginx.conf` 等 |

---

## 專案現況

**五個階段全部完成**：帳號 → LLM 設定 → 影片與文字稿 → 片語／聽寫／問答（LangGraph）→ 部署。
細節與已知限制看 `DEVELOPMENT-PLAN.md`。

部署：內網走 `docker-compose.yaml`（nginx + backend 兩容器）；
Cloud Run 走 `Dockerfile.cloudrun`（單容器，FastAPI 直接伺服前端），步驟見 `DEPLOY-CLOUDRUN.md`。
階段進度、資料表、agent 設計、API 清單都在 **`DEVELOPMENT-PLAN.md`**。

```
backend/          FastAPI（python api.py，port 8000，路由一律 /api）
├── api.py            進入點：lifespan 建表 + seed admin
├── config.py         pydantic-settings，讀 backend/.env
├── crypto.py         密碼雜湊 + Fernet（api_key 加密）
├── security.py       JWT 簽發驗證 + get_current_user / require_admin
├── db/               engine.py（連線）、tables.py（Core Table 定義）
│                     migrate.py（啟動時自動補新增的欄位；create_all 不會改既有的表）
├── llm/              get_chat_model()：唯一建構入口，設定從 DB 讀（勿直接 new ChatOpenAI）
├── agents/           LangGraph：phrase_extractor、phrase_coach、dictation_coach、tutor、
│                     schemas.py（結構化輸出）
├── skills/           phrase-extraction/、sentence-grading/、dictation/（各含 SKILL.md）
├── services/         商業邏輯（路由薄、service 厚）
│                     youtube / transcript（手動貼上 + AI 重新斷句）/ video / clip / phrase
│                     dictation（difflib 比對，不走 LLM）/ chat / tts（edge-tts 微軟語音）
│                     srs（間隔重複，phrases 與 clips 共用）/ user / llm_provider
└── routers/          auth、settings、videos、clips、phrases、chat、tts、admin_users

frontend/         React 18 + TS + Vite，Aurora Glass 風格
├── src/lib/          api.ts（唯一 API 入口，帶 JWT）、utils、themes、format、youtube、types
│                     tts.ts（朗讀，走後端 /api/tts 的微軟 Neural 語音）
├── src/hooks/        useYouTubePlayer（IFrame 播放器 + 100ms 輪詢，AB 循環靠它）
│                     usePagination（清單分頁，每頁 5 筆，前端切）
├── src/stores/       auth（登入狀態）、pageHeader（集中式標題）、assistant（懸浮問答）
├── src/components/   ui/（shadcn 風元件）、layout/（Sidebar/Header/AppLayout）
│                     assistant/（全站懸浮 AI 問答 + 反白工具列）
└── src/pages/        Login、Dashboard、Videos、Study（核心）、Clips、ClipPractice（聽寫）、
                      Phrases、Settings、AdminUsers
```

### 本機啟動

```bash
# 終端 1：後端（首次先建 venv 裝套件）
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # 已建好可略過
python api.py               # http://localhost:8000

# 終端 2：前端
cd frontend && npm install
npm run dev                 # http://localhost:5173，/api 自動 proxy 到 8000
```

預設管理員 `admin` / `admin`（`backend/.env` 可改，已建立的帳號不會被覆寫）。

### 動工規則

- **一律照 `reference/` 的慣例**，不要自行發明架構或風格。
- **不要幫我執行程式**，只改程式；要跑什麼直接把指令給我。
- **改完程式要更新這份 `CLAUDE.md`**（保持精簡、勿超過 500 行；細節寫進 `DEVELOPMENT-PLAN.md`）。
- 只用開源或免費套件。
