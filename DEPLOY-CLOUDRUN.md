# Cloud Run 部署指南（以 GCP 介面操作為主）

> 本機開發用 SQLite + `python api.py`；上雲改成 **Cloud Run（單一服務）+ Cloud SQL PostgreSQL**。
> 內網 docker-compose 的部署方式不受影響，見 `reference/deploy/deploy-guide.md`。

---

## 0. 架構決定

**一個 Cloud Run 服務就好**：前端 build 成靜態檔，直接由 FastAPI 伺服（`Dockerfile.cloudrun`）。

| | 單一服務（採用） | 前後端各一個服務 |
|---|---|---|
| 網址 | 一個，前端打 `/api` 同源 | 兩個，要 nginx 反代到 `*.run.app`（牽扯 resolver + TLS） |
| CORS | 不需要 | 需要處理 |
| 費用 | 一份 | 兩份 |

`api.py` 底部會偵測 `backend/static` 是否存在：存在就伺服前端並做 SPA fallback，不存在就純 API。
**所以本機開發完全不受影響**（本機沒有那個目錄，前端照舊走 Vite dev server）。

---

## 1. 前置作業

1. 進 [Google Cloud Console](https://console.cloud.google.com/) → 建立專案（或選既有的），記下**專案 ID**。
2. 左上角選單 → **API 和服務 → 啟用 API 和服務**，啟用這幾個：
   - Cloud Run Admin API
   - Cloud Build API
   - Artifact Registry API
   - Secret Manager API
3. 確認專案已**綁定帳單帳戶**（Cloud Run 免費額度內也需要綁定）。

> 資料庫用 Neon（見 §2）就**不需要**啟用 Cloud SQL Admin API。
> 若改用 Cloud SQL，見附錄 A。

---

## 2. 建立資料庫（Neon PostgreSQL）

> Cloud Run 的檔案系統是暫時性的，**SQLite 會在每次重啟後消失**，所以上雲一定要換 PostgreSQL。
>
> 這裡用 [Neon](https://neon.tech)（serverless PostgreSQL）而不是 Cloud SQL：
> Cloud SQL 是「執行個體存在就計費」，最小規格也要月付約 US$8–10；
> **Neon 免費方案不用信用卡、閒置自動休眠、不用不計費**，0.5 GB 對這個 app（純文字）綽綽有餘。
> 而且走標準 TCP + TLS，Cloud Run 那邊不必設定 Cloud SQL 連線。

1. 到 [neon.tech](https://neon.tech) 註冊（可用 Google 帳號）。
2. **Create project**：
   - Project name：`yt-learn`
   - Postgres 版本：預設即可
   - **Region：選離 Cloud Run 最近的** —— Neon 沒有台灣節點，
     搭 `asia-east1` 的話選 **AWS Singapore (`ap-southeast-1`)** 或 **AWS Tokyo (`ap-northeast-1`)**，
     延遲約 30–50ms。
   - Database name：`ytlearn`
3. 建好後在 **Connection Details** 取連線字串。
   **務必切到「Pooled connection」**（host 會多一段 `-pooler`）：
   Cloud Run 會水平擴展，每個執行個體各自帶一組連線池，用直連很容易把連線數吃光。
4. 把它改寫成 SQLAlchemy 的格式（把開頭的 `postgresql://` 換成 `postgresql+psycopg://`）：

   ```
   postgresql+psycopg://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/ytlearn?sslmode=require
   ```

   這串等一下要放進 Secret Manager（§5）。

> **休眠與喚醒**：免費方案閒置約 5 分鐘後會 suspend，下次查詢要等 0.5–3 秒喚醒。
> 加上 Cloud Run 冷啟動，**第一次開頁面可能要等十幾秒**，之後就正常了。
> 程式端不用改：`backend/db/engine.py` 的 `pool_pre_ping=True` 會在借用連線前先探測，
> 休眠後被斷掉的連線會自動重連。

---

## 3. 建立 Artifact Registry（放 image）

1. 選單 → **Artifact Registry** → **建立存放區**。
2. 名稱 `yt-learn`、格式 **Docker**、區域選**與 Cloud Run 同區**。
3. 建好後路徑會是：`<區域>-docker.pkg.dev/<專案ID>/yt-learn`

---

## 4. 建置並推送 image

### 做法 A：從 GitHub 自動建置（推薦，之後每次 push 自動更新）

1. 先把專案推到 GitHub（**確認 `.env`、`backend/.env` 沒有進版控**，`.gitignore` 已擋掉）。
2. 選單 → **Cloud Build → 觸發條件 → 建立觸發條件**：
   - 事件：推送到分支
   - 來源：連結你的 GitHub 儲存庫，分支選 `main`
   - 設定：**Dockerfile**
   - Dockerfile 目錄：`/`
   - Dockerfile 名稱：`Dockerfile.cloudrun`
   - 映像檔名稱：`<區域>-docker.pkg.dev/<專案ID>/yt-learn/app:$COMMIT_SHA`
3. 按「執行觸發條件」跑第一次建置。

### 做法 B：本機 build 後推上去

```bash
cd /home/aidankao/aidan/projects/yt-learn
gcloud auth login
gcloud config set project <專案ID>
gcloud auth configure-docker <區域>-docker.pkg.dev

docker build -f Dockerfile.cloudrun -t <區域>-docker.pkg.dev/<專案ID>/yt-learn/app:0.1 .
docker push <區域>-docker.pkg.dev/<專案ID>/yt-learn/app:0.1
```

---

## 5. 把機密放進 Secret Manager

選單 → **Secret Manager** → 建立密鑰，各建一個（值自己產）：

| 密鑰名稱 | 值 | 怎麼產 |
|---|---|---|
| `yt-learn-jwt-secret` | 隨機字串 | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `yt-learn-encryption-key` | Fernet 金鑰 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `yt-learn-db-url` | 資料庫連線字串 | §2 第 4 步那一串（Neon 的 pooled 連線） |
| `yt-learn-admin-password` | 管理員初始密碼 | 自己想一組**別再用 admin** |

> ⚠️ `ENCRYPTION_KEY` 一旦設定就**不要再改**，否則已存的 LLM API key 會解不開，要重新輸入。

---

## 6. 部署 Cloud Run 服務

選單 → **Cloud Run** → **部署容器 → 服務**：

1. **容器映像檔網址**：選剛才推上去的 image。
2. **服務名稱**：`yt-learn`；**區域**：與 Cloud SQL 同區。
3. **驗證**：勾選「允許未經驗證的叫用」（應用程式本身有帳密登入）。
4. 展開 **容器、磁碟區、網路、安全性**：

   **容器 → 設定**
   - **容器連接埠：`8000`**（`api.py` 寫死 8000，這裡一定要改掉預設的 8080）
   - 記憶體：**1 GiB**（LangChain + yt-dlp 吃得動）；CPU：1
   - 要求逾時：**600 秒**（片語萃取、Whisper 轉錄可能久）

   **容器 → 變數和密鑰**
   - 環境變數：
     | 名稱 | 值 |
     |---|---|
     | `APP_ENV` | `prod` |
     | `ALLOW_REGISTRATION` | `false` |
     | `ADMIN_USERNAME` | `admin` |
   - 以密鑰形式參照（選「參照密鑰」→ 掛成環境變數）：
     | 環境變數 | 密鑰 |
     |---|---|
     | `DATABASE_URL` | `yt-learn-db-url` |
     | `JWT_SECRET` | `yt-learn-jwt-secret` |
     | `ENCRYPTION_KEY` | `yt-learn-encryption-key` |
     | `ADMIN_PASSWORD` | `yt-learn-admin-password` |

   > 用 Neon 的話**不需要**設定「Cloud SQL 連線」那一段，它走一般的對外 TLS 連線。
   > 改用 Cloud SQL 才要設，見附錄 A。

   **設定 → CPU 配置**
   - 選 **「CPU 一律配置」**（instance-based billing）
     > **這一項很重要**：文字稿擷取跑在 FastAPI 的 `BackgroundTasks`，是在回應送出後才執行的。
     > 預設的「僅在要求處理期間配置 CPU」會讓背景工作被凍結，文字稿永遠停在 `pending`。
     > 不想付常駐費用的話，替代方案是把**最少執行個體數設為 1** 並接受閒置費用，
     > 或之後改用 Cloud Tasks 把擷取改成獨立請求（見 §9）。

   **設定 → 自動調度資源**
   - 最少執行個體：`0`（省錢，代價是冷啟動約 10–20 秒）
   - 最多執行個體：`2`（個人用足夠，也避免暴衝帳單）

5. 按 **建立**，等狀態變綠。

---

## 7. 首次啟動檢查

1. 開 Cloud Run 給的網址 → 應該直接看到登入頁。
2. 用 `admin` + 你在 Secret Manager 設的密碼登入。
3. 進 **設定** → 註冊 LLM provider（貼 OpenAI key）→ 按**測試連線**。
4. 進 **影片庫** → 匯入一支有英文字幕的影片 → 確認狀態變成綠色「YouTube 字幕」。
5. 進 **設定 → 朗讀語音** → 按試聽，確認 `edge-tts` 在雲端連得出去。
6. Cloud Run → **記錄** 分頁可以看到後端的 print / traceback，出問題先看這裡。

---

## 8. 之後怎麼更新

用做法 A（GitHub 觸發）的話：

```bash
git add -A && git commit -m "..." && git push
```

Cloud Build 會自動建置新 image。接著 Cloud Run → 服務 → **編輯並部署新修訂版本** → 選新的 image → 部署。
（想全自動的話，在 Cloud Build 觸發條件裡加一個部署到 Cloud Run 的步驟。）

**資料庫結構有變更時**：`api.py` 啟動會跑 `db/migrate.py` 自動補新增的欄位，
但**只處理「可為 NULL 且沒有預設值」的新欄位**。改型別、刪欄位、加 NOT NULL 都要自己處理，
或改用 Alembic（見 `reference/backend/database.md` §7）。

---

## 9. 已知限制與注意事項

- **背景任務**：文字稿擷取走 `BackgroundTasks`，跟服務同一個程序。除了 §6 的 CPU 設定外，
  要更穩妥就得改成 Cloud Tasks／Pub-Sub 觸發獨立端點。目前規模不值得，但要知道有這個上限。
- **yt-dlp 可能被擋**：YouTube 對機房 IP 較敏感，Whisper fallback（下載音訊那條路）在 Cloud Run 上
  可能失敗。**有字幕的影片不受影響**，因為那條路只呼叫字幕 API。
- **`edge-tts` 走微軟未公開端點**：對方若封鎖就會回 502，前端會自動退回瀏覽器語音。
- **TTS 快取（`backend/data/tts/`）在 Cloud Run 上不會保留**，每次冷啟動要重新合成。
  真的在意就改存 Cloud Storage。
- **費用控制**：最多執行個體設 2。Neon 免費方案閒置不計費，所以主要成本只有 Cloud Run 的
  「CPU 一律配置」那一份；真的不用了就把服務的最少執行個體設 0 或直接刪掉修訂版本。
- **Neon 免費方案的限制**：0.5 GB 儲存、閒置自動休眠、單一分支。
  資料量或並行量長大再考慮升級，或改用附錄 A 的 Cloud SQL。
- **`ALLOW_REGISTRATION=false`**：公開網址上務必關掉自由註冊，改由管理員在「帳號管理」建帳號，
  否則陌生人註冊後會用掉你的 LLM 額度。

---

## 附錄 A：改用 Cloud SQL（PostgreSQL）

什麼時候值得換掉 Neon：**資料需要留在 GCP 內**（公司資料、落地要求）、
需要私有 IP 與自動備份、或不能接受免費方案休眠喚醒的延遲。
代價是最小規格也要月付約 US$8–10，**沒人用也照算**。

### A.1 建立執行個體
1. 先到 **API 和服務** 啟用 **Cloud SQL Admin API**。
2. 選單 → **SQL** → **建立執行個體** → 選 **PostgreSQL**：
   - 執行個體 ID：`yt-learn-db`
   - **postgres 使用者密碼**：自己設一組，記下來
   - 資料庫版本：PostgreSQL 15（或更新）
   - 區域：**與 Cloud Run 同一個區域**（例如 `asia-east1`）
   - 機器設定：個人用途選 **Sandbox / 共用核心（db-f1-micro）** 最省
   - 儲存空間：10 GB、關閉「自動增加儲存空間」可避免爆帳單
3. 進入該執行個體：
   - **資料庫** 分頁 → 建立資料庫，名稱 `ytlearn`
   - **總覽** 分頁 → 記下 **執行個體連線名稱**（格式 `專案ID:區域:執行個體ID`）

### A.2 連線字串
把 §5 的 `yt-learn-db-url` 密鑰改成走 Unix socket 的形式：

```
postgresql+psycopg://postgres:<你的DB密碼>@/ytlearn?host=/cloudsql/<執行個體連線名稱>
```

### A.3 Cloud Run 設定
部署（§6）時多一步：**容器、磁碟區、網路、安全性 → 連線 → Cloud SQL 連線 → 新增連線**，
選 `yt-learn-db`。其餘設定與 Neon 版相同。

### A.4 多個 side project 共用
Cloud SQL 貴在「執行個體」而不是「資料庫」。同一個執行個體裡可以開多個 database
（`ytlearn`、`projectB`…），成本攤成一份 —— 這也是把 side project 集中在同一個 GCP 專案的主因。

---

## 附錄 B：資料庫搬遷

Neon ↔ Cloud SQL 之間互搬，或之後要換供應商時：

```bash
# 匯出（來源）
pg_dump "<來源連線字串>" -Fc -f yt-learn.dump

# 匯入（目標；目標資料庫要先建好）
pg_restore -d "<目標連線字串>" --no-owner --no-privileges yt-learn.dump
```

搬完只要更新 Secret Manager 的 `yt-learn-db-url` 並重新部署一個修訂版本即可，**程式不用改**
（這正是全程用 SQLAlchemy Core、只靠 `DATABASE_URL` 切換的好處）。
