# Cloud Run 部署指南

> **這份文件只寫一種部署方式**（就是你會用的那一種）：
> **全程 GCP 主控台介面操作 + GitHub 推送自動部署 + Neon PostgreSQL**。
> 不需要用到終端機、不需要自己 build image、不使用 Cloud SQL。
>
> 本機開發維持原樣（SQLite + `python api.py` + `npm run dev`），不受影響。

---

## 0. 架構

**一個 Cloud Run 服務**：前端 build 成靜態檔，直接由 FastAPI 伺服（`Dockerfile.cloudrun`）。
所以只有一個網址、前端打 `/api` 同源、不必處理 CORS、只付一份錢。

資料庫用 **Neon**（serverless PostgreSQL，免費方案閒置不計費）。
Cloud Run 的檔案系統是暫時性的，**SQLite 會在每次重啟後消失**，所以上雲一定要用外部資料庫。

流程：**你 push 到 GitHub → Cloud Build 自動建置 → Cloud Run 自動部署新版本**。

---

## 1. 前置作業

1. 把專案推到 GitHub（用你慣用的方式，GitHub Desktop / VS Code 都可以）。
   **確認 `.env`、`backend/.env` 沒有被上傳** —— `.gitignore` 已經擋掉了，但上傳後到 GitHub 網頁確認一下。
2. 進 [Google Cloud Console](https://console.cloud.google.com/) → 左上角專案選單 → **新增專案**
   （建議叫 `sideprojects`，之後其他小專案共用）。
3. 確認專案有**綁定帳單帳戶**：搜尋列打 `帳單` → 進去看有沒有連結帳戶。免費額度內也需要綁。
4. 啟用 API：搜尋列打 `API 和服務` → 進去 → **啟用 API 和服務** → 逐一搜尋並啟用：
   - `Cloud Run Admin API`
   - `Cloud Build API`
   - `Artifact Registry API`
   - `Secret Manager API`

---

## 2. 建立資料庫（Neon）

1. 到 [neon.tech](https://neon.tech) 用 Google 帳號註冊。
2. 按 **Create project**：
   - **Project name**：`yt-learn`
   - **Postgres version**：預設
   - **Region**：Neon 沒有台灣節點，選 **AWS Singapore (`ap-southeast-1`)**
     或 **AWS Tokyo (`ap-northeast-1`)**（等一下 Cloud Run 選 `asia-east1`，延遲約 30–50ms）
   - **Database name**：`ytlearn`
3. 建好後會看到 **Connection Details**。**把上方的下拉切成「Pooled connection」**
   （host 中間會多一段 `-pooler`）。
   > 一定要用 pooled：Cloud Run 會水平擴展，每個執行個體各帶一組連線池，直連會把連線數吃光。
4. 複製那串連線字串，**把開頭的 `postgresql://` 改成 `postgresql+psycopg://`**，變成這樣：

   ```
   postgresql+psycopg://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/ytlearn?sslmode=require
   ```

   先貼到記事本，第 3 節要用。

> **關於休眠**：免費方案閒置約 5 分鐘後會 suspend，下次查詢要等 0.5–3 秒喚醒。
> 加上 Cloud Run 冷啟動，**第一次開頁面可能等十幾秒**，之後就順了。
> 程式不用改：`backend/db/engine.py` 的 `pool_pre_ping=True` 會自動處理休眠後的斷線重連。

---

## 3. 建立密鑰（Secret Manager）

> **這裡和第 4.3 節的「變數和密鑰」是兩件事，兩個都要做：**
>
> | 在哪裡 | 做什麼 |
> |---|---|
> | **Secret Manager**（本節） | **存放密鑰的「值」** —— 真正的密碼、連線字串加密保管在這裡 |
> | **Cloud Run → 容器 → 變數和密鑰**（4.3 節） | **引用**上面的密鑰，指定它在容器裡叫什麼環境變數名 |
>
> Cloud Run 本身不存值，只存「去拿哪一格」的參照，這樣密碼才不會出現在服務設定裡被看到。
>
> **想少切換一次頁面的話**：4.3 節按「+ 參照密鑰」時，下拉選單裡有 **「建立新密鑰」**，
> 可以當場輸入名稱與值，等於在同一頁完成本節的動作。本節先建好也可以，兩種都行。

要建 **3 個**密鑰。先準備好兩個值：

| 要準備的值 | 怎麼來 |
|---|---|
| 資料庫連線字串 | 第 2 節第 4 步那一串 |
| JWT 簽章密鑰 | 一串 40 字以上的隨機字串，產生方式見下方 |
| 管理員初始密碼 | 自己想一組，**別再用 `admin`** |

### JWT 簽章密鑰怎麼產

它只是「一串夠長的隨機字串」，用什麼方式產都行。三選一：

1. **線上密碼產生器（推薦）**：開 [bitwarden.com/password-generator](https://bitwarden.com/password-generator/)
   → 長度拉到 **64**、**只勾大小寫與數字**（符號取消，免得之後貼來貼去踩到跳脫字元）→ 複製。
   這類產生器都是在瀏覽器本機運算，不會上傳。
2. **Chrome 內建**：在任何註冊頁的密碼欄位右鍵 → 「建議使用高強度密碼」。
3. **Cloud Shell**：GCP 主控台右上角的 `>_` 圖示會在瀏覽器裡開終端，不用裝東西：
   `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`

> 長度比複雜度重要，40 字以上就夠安全。**不用另外抄下來** —— 之後要看隨時可以進
> Secret Manager 點該密鑰 →「版本」→ 檢視值。

### 操作步驟（重複 3 次）

1. 主控台**最上方搜尋列**輸入 `Secret Manager`，點結果進去。
2. 上方按藍色的 **「+ 建立密鑰」**。
3. 只填兩格，其餘保持預設：
   - **名稱**
   - **密鑰值**
4. 最下面按 **「建立密鑰」**。

三個密鑰分別是：

| 名稱 | 密鑰值 |
|---|---|
| `yt-learn-db-url` | Neon 的 pooled 連線字串（`postgresql+psycopg://...`） |
| `yt-learn-jwt-secret` | 你產的隨機字串 |
| `yt-learn-admin-password` | 你想的管理員密碼 |

做完清單上應該有 3 筆。

### ⚠️ 先授權，否則部署一定失敗

Cloud Run 的服務帳戶預設**沒有讀取密鑰的權限**。先在這裡一次授權，就不會在部署時卡住：

1. 主控台搜尋列輸入 `IAM`，點 **「IAM 與管理」** 的 IAM 頁面。
2. 上方按 **「+ 授予存取權」**。
3. **新增主體**：填 `<專案編號>-compute@developer.gserviceaccount.com`
   （專案編號在主控台首頁的「專案資訊」卡片上，是一串數字）。
4. **指派角色**：搜尋 `Secret Manager` → 選 **「Secret Manager 密鑰存取者」**。
5. 按 **儲存**，等 30–60 秒生效。

> 沒做這步的話，部署會失敗並出現這種錯誤：
> `Permission denied on secret: ... The service account used must be granted the
> 'Secret Manager Secret Accessor' role`。
> 補做完再回 Cloud Run 按「編輯並部署新的修訂版本」重新部署即可。

> ⚠️ **JWT 密鑰建立後就不要再改**。
> 系統會用它推導出加密 LLM API key 的金鑰，改掉的話已存的 API key 會解不開，要重新輸入一次。

---

## 4. 部署 Cloud Run 服務（含 GitHub 自動建置）

> 這一節**全部在同一個表單完成**。表單很長，照下面由上往下的順序填，沒提到的欄位保持預設。

### 4.1 開啟表單並連結 GitHub

1. 主控台搜尋列輸入 `Cloud Run`，點進去。
2. 上方按 **「部署容器」** 旁的下拉箭頭 → 選 **「服務」**。
3. 在最上面選 **「從原始碼儲存庫持續部署新的修訂版本」**（不是預設的那個選項）。
4. 按下面的 **「設定 Cloud Build」**，右側會滑出面板：
   - **儲存庫供應商**：GitHub
   - 按 **「驗證」** → 跳出 GitHub 授權視窗 → 同意
   - **儲存庫**：選 `yt-learn`（第一次要按「安裝 Google Cloud Build」，選要授權的儲存庫）
   - 按 **下一步**
   - **分支**：`^main$`（預設就是）
   - **建置類型**：選 **「Dockerfile」**
   - **Dockerfile 的來源位置**：填 **`Dockerfile.cloudrun`** ⚠️（預設是 `Dockerfile`，一定要改）
   - 按 **「儲存」**

### 4.2 服務基本設定

| 欄位 | 填什麼 |
|---|---|
| **服務名稱** | `yt-learn` |
| **區域** | `asia-east1`（台灣） |
| **驗證** | 選 **「允許未經驗證的叫用」**（app 本身有帳密登入） |

再往下兩個區塊：

| 區塊 | 設定 |
|---|---|
| **CPU 配置與定價** | 選 **「CPU 一律配置」** ⚠️ |
| **修訂版本自動調度資源** | 最少執行個體 `0`、最多執行個體 `2` |

> ⚠️ **「CPU 一律配置」一定要選**：文字稿擷取跑在 FastAPI 的背景工作，是在回應送出**之後**才執行的。
> 預設的「僅在要求處理期間配置 CPU」會把背景工作凍結，影片的文字稿會永遠停在「抓取中」不會完成。
>
> 最少執行個體 `0` 最省錢，代價是閒置後冷啟動約 10–20 秒。

### 4.3 展開「容器、磁碟區、網路、安全性」

點這個可展開的區塊。裡面有很多分頁，**只需要動「容器」分頁下的兩個子頁**。

#### (a)「設定」子頁

| 欄位 | 填什麼 |
|---|---|
| **容器連接埠** | **`8000`** ⚠️ 一定要改掉預設的 `8080` |
| 記憶體 | `1 GiB` |
| CPU | `1` |
| 要求逾時 | `600` 秒（片語萃取可能要跑十幾秒） |

> ⚠️ 連接埠沒改成 8000 的話**部署一定失敗**，錯誤訊息會是「容器無法在 PORT 上啟動並監聽」。

#### (b)「變數和密鑰」子頁

**先加 3 個一般環境變數** —— 按 **「+ 新增變數」** 三次：

| 名稱 | 值 |
|---|---|
| `APP_ENV` | `prod` |
| `ALLOW_REGISTRATION` | `false` |
| `ADMIN_USERNAME` | `admin` |

**再加 3 個密鑰** —— 按 **「+ 參照密鑰」** 三次，每次跳出的小面板這樣填：

- **密鑰**：下拉選第 3 節建好的那一個
  （若第 3 節還沒做，下拉選單最上面有 **「建立新密鑰」**，可以當場輸入名稱與值）
- **參照方法**：選 **「以環境變數形式公開」**
- **名稱**（環境變數名）：照下表
- **版本**：`latest`

> 這裡選的是「要引用哪一格保險箱」，值不會顯示在服務設定上。
> 上面的「+ 新增變數」則是直接把值明碼寫進設定，所以只給 `APP_ENV` 那種不敏感的用。

| 環境變數名稱 | 選哪個密鑰 |
|---|---|
| `DATABASE_URL` | `yt-learn-db-url` |
| `JWT_SECRET` | `yt-learn-jwt-secret` |
| `ADMIN_PASSWORD` | `yt-learn-admin-password` |

> 若第 3 節的授權已經做過，這裡不會有問題。
> 畫面上方若仍跳出黃色的權限提示，旁邊有一顆 **「授予」**，按下去即可。

### 4.4 建立

捲到最下面按 **「建立」**。

Cloud Build 會先從 GitHub 拉程式碼建置 image（第一次約 5–10 分鐘，因為要裝 Python 套件和 build 前端），
建好後自動部署。服務名稱旁出現**綠色勾勾**就成功了，上方會顯示網址
`https://yt-learn-xxxxx.a.run.app`。

**如果失敗**（紅色叉叉）：
- 建置階段的錯誤 → 搜尋列進 `Cloud Build` → **記錄** 看是哪一步掛掉
- 啟動階段的錯誤 → Cloud Run → 點服務 → 上方 **「記錄」** 分頁

最常見的兩個原因就是上面標 ⚠️ 的：**容器連接埠沒改成 8000**、**密鑰權限沒授予**。

---

## 5. 首次啟動檢查

**服務網址**：Cloud Run → 點服務 `yt-learn` → 頁面最上方那串網址。

依序確認：

1. 開網址 → 看到**登入頁**（第一次要等 10–20 秒，冷啟動 + Neon 喚醒）。
2. 用 `admin` + 你在第 3 節設的密碼登入。
3. 進 **設定** → 新增 LLM provider（貼 OpenAI key）→ 按插頭圖示**測試連線**，要出現「連線正常」。
4. 進 **設定 → 朗讀語音** → 按**試聽**，確認 `edge-tts` 在雲端連得出去。
5. 進 **影片庫** → 匯入一支**有英文字幕**的影片 → 狀態要從琥珀色變成綠色「YouTube 字幕」。
   > 卡在「抓取文字稿中」不動 → 八成是 4.2 的 **CPU 配置**沒選「一律配置」。
6. 進 **帳號管理** → 把 admin 密碼再改一次（Secret Manager 那組只是初始密碼）。

**出問題就看記錄**：Cloud Run → 點服務 → 上方 **「記錄」** 分頁。
後端所有的訊息與錯誤堆疊都在這裡，包含 `[migrate]`（自動補資料庫欄位）、`[seed]`（建立管理員）。

---

## 6. 之後怎麼更新

**把程式碼推到 GitHub 的 `main` 分支就好**，其餘全自動：

```
你 push → Cloud Build 自動建置 → Cloud Run 自動部署新修訂版本
```

要看進度：Cloud Run → 點服務 → **修訂版本** 分頁，或去 `Cloud Build` 看建置記錄。

**資料庫結構有變更時**：`api.py` 啟動會自動補上新增的欄位（`db/migrate.py`），
但**只處理「可為空且沒有預設值」的新欄位**。改型別、刪欄位、加必填欄位都要另外處理。

---

## 7. 注意事項

- **`ALLOW_REGISTRATION=false`**：公開網址務必關掉自由註冊（4.3 已設），
  改由管理員在「帳號管理」建帳號，否則陌生人註冊會用掉你的 LLM 額度。
- **`JWT_SECRET` 不要改**：它同時用來推導加密 LLM API key 的金鑰，改了已存的 key 會失效。
- **費用**：Neon 免費方案閒置不計費；Cloud Run 的成本主要來自「CPU 一律配置」。
  最多執行個體設 `2` 可避免暴衝。真的不用了就把服務刪掉。
- **yt-dlp 可能被擋**：YouTube 對機房 IP 較敏感，沒有字幕的影片走 Whisper 轉錄那條路
  在 Cloud Run 上可能失敗。**有字幕的影片不受影響**。
- **`edge-tts` 走微軟未公開端點**：對方若封鎖會回 502，前端會自動退回瀏覽器語音。
- **朗讀語音的快取不會保留**：Cloud Run 檔案系統是暫時性的，冷啟動後要重新合成。
- **換資料庫只要改密鑰**：更新 `yt-learn-db-url` 的內容再重新部署一次即可，程式不用動
  （全程走 SQLAlchemy Core，只靠 `DATABASE_URL` 切換）。
