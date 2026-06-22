# 本地 Docker 部署 — 測試/正式分離 設計文件

- 日期:2026-06-23
- 狀態:設計已確認(使用者授權「你幫我確認就好,定義清楚」),待寫實作計畫
- 範圍:`daily-todo-app` 的本地部署方式;分支 `feature/local-docker-deploy`(從現行 HEAD 起)

## 1. 目標

在本機建立**兩套完整、互相隔離**的環境,測試與正式分開:

- **正式(日常用)**:純 Docker(app + MySQL 都在容器),平常用 **Docker Desktop 一鍵開/關**;資料永久保留。
- **開發/測試(沙盒)**:`pnpm dev` 在主機跑(熱重載),接一顆獨立的 MySQL 容器;可隨意亂試、清空重來,絕不影響正式資料。

兩套可**同時跑**(不同 port)。改完程式用 **`pnpm deploy`** 一鍵把最新版推上正式。

## 2. 兩套環境定義

| | 開發/測試(沙盒) | 正式(日常用) |
|---|---|---|
| App 跑法 | `pnpm dev`(主機,熱重載) | Docker 容器(build 過的 image) |
| App 網址 | `localhost:4179` | `localhost:4178` |
| MySQL | Docker,host `3307` → 容器 `3306` | Docker,host `3308` → 容器 `3306` |
| DB 名稱 | `daily_todo`(沙盒)、`daily_todo_test`(自動化測試) | `daily_todo` |
| 資料 volume | `daily_todo_mysql`(現有) | `daily_todo_prod_mysql`(新,永久) |
| 上傳檔 | 主機 `uploads/` | 容器 volume `daily_todo_prod_uploads`(永久) |
| 設定來源 | `.env`(`PORT=4179`) | `.env.prod`(`PORT=4178`) |
| 改完即見 | 是(熱重載) | 否,需 `pnpm deploy` 重建 |
| 日常開關 | `pnpm dev` / Ctrl-C;DB 用 `docker compose up/down` | Docker Desktop 一鍵開/關 |

**心智模型**:正式那組像「家裡常開的伺服器」(Docker Desktop 開機點一下就在);沙盒是「工作檯」,你在這邊改、壞了重來;`pnpm deploy` 是「驗收上線」。

## 3. 元件與檔案

### 3.1 容器化 App
- **`Dockerfile`**(新)— 多階段:
  1. deps:`pnpm install --frozen-lockfile`
  2. build:`pnpm build`(`vite build` + esbuild 打包 server → `dist/`)
  3. runtime:精簡 node image,複製 `dist/` + 正式相依 + `drizzle/`(migration 檔),`CMD node dist/index.js`,`NODE_ENV=production`。
- **`.dockerignore`**(新)— 排除 `node_modules`、`.git`、`dist`、`uploads`、`.env*`、測試與文件,縮小 build context。

### 3.2 Compose
- **`docker-compose.yml`**(保留現狀,微調)= 開發/測試 MySQL(host 3307)。`docker compose up -d` 行為不變,使用者肌肉記憶不破壞。新增:啟動時自動建立第二個資料庫 `daily_todo_test`(透過 init SQL 或 `MYSQL_DATABASE` 之外的建庫腳本)。
- **`docker-compose.prod.yml`**(新)= 正式一組:
  - `app` 服務:`build: .`(指向 Dockerfile)且 `image: daily-todo-app:prod`(tag 固定,讓 Docker Desktop 一鍵啟動用既有 image)、`env_file: .env.prod`、`ports: "4178:4178"`、`depends_on: db(healthy)`、掛 `daily_todo_prod_uploads` 到容器 `uploads/`、`restart: unless-stopped`。
  - `db` 服務:MySQL 8、`ports: "3308:3306"`、volume `daily_todo_prod_mysql`、healthcheck、`restart: unless-stopped`。

### 3.3 設定檔
- **`.env`**(改)— `PORT` 由 4178 改成 **4179**(正式接管 4178)。其餘不動。
- **`.env.prod`**(新,**gitignore**)— 正式機密:
  - `DATABASE_URL=mysql://daily:<prod_pw>@db:3306/daily_todo`(容器內以服務名 `db` 連線)
  - `PORT=4178`
  - `NODE_ENV=production`
  - `OPENAI_API_KEY=<金鑰>`
  - `JWT_SECRET=<正式專用、夠長的隨機值>`
  - `OWNER_OPEN_ID=dev-user`
  - `ALLOW_DEV_LOGIN=1`(見 3.4)
- **`.env.prod.example`**(新,提交)— 同上但機密留空白/佔位,當範本。
- **`.gitignore`**(改)— 補一行 `.env.prod`(現有規則沒涵蓋它)。

### 3.4 登入(關鍵修正)
現況:`/api/dev-login` 只在 `NODE_ENV==="development"` 註冊;正式是 `production`,而真正 OAuth 需要空白的 `OAUTH_SERVER_URL` → **本地正式會沒有登入方式**。

修正:`server/_core/index.ts` 把註冊條件改成
```ts
if (process.env.NODE_ENV === "development" || process.env.ALLOW_DEV_LOGIN === "1") {
  registerDevAuthRoutes(app);
}
```
預設關閉(雲端部署不設 `ALLOW_DEV_LOGIN` 就不會開);本地正式在 `.env.prod` 設 `ALLOW_DEV_LOGIN=1`,即可用 `http://localhost:4178/api/dev-login` 登入。**這是唯一的功能性程式改動**,且行為對既有環境零影響(dev 仍照舊)。

### 3.5 部署腳本與指令
- **`scripts/deploy.sh`**(新)— 步驟:
  1. 載入 `.env.prod`(存在性檢查,缺檔即報錯並提示複製範本)。
  2. `docker compose -f docker-compose.prod.yml up -d db`,輪詢等 healthy。
  3. 跑 migration:`DATABASE_URL=mysql://daily:<prod_pw>@127.0.0.1:3308/daily_todo pnpm drizzle-kit migrate`(從主機連 published port 3308;與容器內的 `db:3306` 區隔)。
  4. `docker compose -f docker-compose.prod.yml build app`。
  5. `docker compose -f docker-compose.prod.yml up -d app`。
  6. 印出 `✅ 正式已上線:http://localhost:4178`。
- **`package.json`**(改)加:
  - `"deploy": "bash scripts/deploy.sh"`
  - `"prod:up": "docker compose -f docker-compose.prod.yml up -d"`(等同 Docker Desktop 一鍵開,CLI 版)
  - `"prod:down": "docker compose -f docker-compose.prod.yml down"`
  - `"prod:logs": "docker compose -f docker-compose.prod.yml logs -f app"`

### 3.6 自動化測試 DB(順帶,含入本輪)
- 開發那顆 MySQL 多開一個 `daily_todo_test` 資料庫(3.2 的 init)。
- 新增 **`.env.test`**(gitignore;或在 `vitest.config.ts` / 測試 setup 指定)讓 `pnpm test` 連 `daily_todo_test`,不污染沙盒 `daily_todo`。
- 目標:現有 4 個因「沒有測試 DB」而失敗的測試轉綠;其餘 79 個維持綠。

## 4. 資料流與隔離

- 容器內 app → 同網段以服務名 `db:3306` 連各自的 MySQL。
- 主機工具(drizzle migrate)→ 以 `127.0.0.1:<published port>` 連線(沙盒 3307 / 正式 3308)。
- 三份資料完全隔離:正式 `daily_todo`(volume A)、沙盒 `daily_todo`(volume B)、測試 `daily_todo_test`(volume B 內另一個庫)。沙盒/測試怎麼搞都不碰正式 volume A。

## 5. 不做(YAGNI)

- 不做雲端/遠端部署、不做反向代理 / HTTPS / 網域。
- 不做正式的真 OAuth 串接(本地用 dev-login 開關即可)。
- 不做 CI pipeline、不做藍綠 / 滾動部署。
- 不把沙盒資料自動同步到正式(需要時手動 dump/restore)。
- 不改任何既有功能邏輯(除 3.4 一處登入註冊條件)。

## 6. Global Constraints

- 用 **pnpm**(非 npm)。
- 驗收:`pnpm run check`(0 錯)、`pnpm run build`(成功)、`pnpm test`(目標 83 綠 / 0 失敗;至少不低於現況 79 綠)。
- 不破壞現有開發流程:`docker compose up -d` + `pnpm dev` 照舊可用(dev port 改 4179)。
- 機密只進 `.env` / `.env.prod`(皆 gitignore);範本 `.env.prod.example` 不含真值。
- 既有 MySQL 容器 `daily-todo-mysql`(3307)與 volume `daily_todo_mysql` 保留不動(沙盒沿用)。

## 7. 驗收(需真實 Docker)

1. `pnpm deploy` → 正式 stack 起來,`http://localhost:4178` 可開、`/api/dev-login` 可登入、建一筆 task 成功。
2. 同時 `docker compose up -d`(沙盒 DB)+ `pnpm dev` → `http://localhost:4179` 可開、可登入、建 task。
3. 在沙盒(4179)建/刪資料,確認正式(4178)資料**不受影響**(隔離成立)。
4. 關掉 `pnpm deploy` 起的容器後,於 **Docker Desktop 點一下啟動** 正式 stack,確認 app+db 都起來、資料還在(一鍵開關成立)。
5. `pnpm test` → 83 綠 / 0 失敗(用 `daily_todo_test`,沙盒資料未被動到)。
6. `pnpm run check` 0 錯、`pnpm run build` 成功。

## 8. 未來(不在本輪)

- 正式 app image 改成不含 build 工具的更小 runtime、加 multi-arch。
- 把 `pnpm deploy` 包成 Makefile 或加 `--no-migrate` 等旗標。
- 沙盒 → 正式 的資料搬移工具。
