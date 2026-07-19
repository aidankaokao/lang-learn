# 專案需求說明（開發者填寫）

> **用法**：開新專案時複製這份到 `reference/PROJECT-REQUIREMENTS.md` 並填寫。
> 新的 Claude Code session 會先讀根目錄 `CLAUDE.md` + 這份需求 + `reference/` 慣例，再開工。
> 勾選用 `[x]`；不確定的留白，session 會在開工前一次問你。

---

## 1. 專案基本

- **專案名稱**：yt-learn
- **APP_ROUTE（路由名稱，內外網共用；見 deploy-guide 路由機制）**：yt-learn
- **一句話目標**：擷取youtube英文影片的內容進行學習，包括聽力訓練（可在界面上用AB擷取需要的段落並儲存重複練習）、重要片語擷取與管理等

## 2. 前端

- [x] 需要前端
- [ ] 不需要前端（純後端 / API / CLI）
- 若需要，**視覺風格三選一**（見 `reference/frontend/frontend-style-*.md`）：
  - [ ] Formal（乾淨後台 SaaS）
  - [ ] Glass Wave（淡藍紫玻璃波）
  - [x] Aurora Glass（極光琉璃，可切主題盤）
- **主要頁面 / 功能**：輸入youtube網址進行影片的語音提取、語音轉文字（或直接從英文字幕提取文字稿）、從文字稿提取重要片語、管理片語與進行練習（包含解析、例句、換句話說，以及讓我造樣造句進行判斷是否正確或需要批改）、搭配AI問答進行不明白的地方練習（例如反白段落進行問答、提取重要片語等），需要有帳號登入（含註冊）

## 3. 後端

- [x] 需要後端 API（FastAPI，見 `reference/backend/backend-conventions.md`）
- **主要 API / 功能**：依需求開發。

## 4. AI Agent

- [x] 需要 AI agent（LangGraph，見 `reference/backend/langgraph-agent.md`）
- **流程 / 說明**：可以根據提取的文字稿或片語進行引導練習，協助我快速理解文章以及片語的用法。如果有其他你認為可以用到ai agent的地方，也可以幫我設計。

## 5. LLM

- [x] 需要用到 LLM（見 `reference/backend/llm-integration.md`）
- provider：[ ] 本地 Ollama　[x] 外部 OpenAI　[ ] 本地 vLLM
- 設定來源：[x] 前端設定頁註冊多個（有前端建議）　[ ] `.env`（無前端）
- **模型**：依前端設定頁面註冊LLM provider

## 6. 資料庫

- [x] 需要資料庫（SQLAlchemy Core，見 `reference/backend/database.md`）
- 初期 [x] SQLite　→ 之後 [x] PostgreSQL
- **主要資料表 / 實體**：初期用sqlite，後期我需要部屬在cloud run，屆時就要用到postgres

## 7. Skill

- [x] 需要設計 skill（`SKILL.md`，見 `reference/backend/skill-design.md`）
- **說明**：依需求開發。

## 8. 部署

- [ ] 現在就要 Docker 部署（見 `reference/deploy/deploy-guide.md`）
- **IMAGE_PREFIX**（image 命名前綴，通常＝專案名）：
- 前端對外埠 **FRONTEND_PORT**：在.env讓我設定
- 內網訪問：`http://<ip>:<FRONTEND_PORT>/<APP_ROUTE>/`
- 之後綁 DNS（團隊 nginx）：`https://<DNS>/<APP_ROUTE>/`

## 9. 其他需求 / 注意事項（自由填寫）

- 只能使用開源或免費的套件，不可使用商業或付費套件。
- 你不可以幫我執行程式，只能修改程式，若要執行請直接給我命令，我自己執行。
- 每次修改完程式請自動更新CLAUDE.md。
- 盡可能保持CLAUDE.md簡潔(盡可能不要超過500行)，若有關於專案細節請另外填寫開發計劃書或其他相關文件，並在CLAUDE.md中提示閱讀即可。
- 這個專案初期在本地測試，後期會在cloud run部屬（利用github同步），屆時開發完進行部屬前請寫一份cloud run部屬的設定文件（步驟須以gcp界面操作為主）
