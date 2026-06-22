# 本地 Docker 部署(測試/正式分離)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本機建立兩套互相隔離的環境 —— 正式(純 Docker、Docker Desktop 一鍵開關、:4178)與開發/測試沙盒(`pnpm dev` 熱重載、:4179),並提供 `pnpm deploy` 一鍵把最新程式重建上正式。

**Architecture:** App 用多階段 Dockerfile 打成 image;`docker-compose.prod.yml` 定義「正式 app 容器 + 正式 MySQL」一組 stack;既有 `docker-compose.yml` 留作沙盒 DB。`scripts/deploy.sh` 串起「起 DB → migrate → build image → 起 app」。一處功能改動:用 `ALLOW_DEV_LOGIN` 環境變數讓正式也能登入。

**Tech Stack:** Docker / docker compose、MySQL 8、Node 22 + pnpm、Vite(client)+ esbuild(server bundle)、Drizzle ORM、Vitest。

## Global Constraints

- 用 **pnpm**(非 npm)。
- 驗收門檻:`pnpm run check`(0 錯)、`pnpm run build`(成功)、`pnpm test`(目標 83 綠 / 0 失敗;至少不低於現況 79 綠)。
- 不破壞既有開發流程:`docker compose up -d` + `pnpm dev` 照舊可用(dev port 改 4179)。
- 機密只進 `.env` / `.env.prod` / `.env.test`(皆 gitignore);範本 `.env.prod.example` 不含真值。
- 既有 MySQL 容器 `daily-todo-mysql`(host 3307)與 volume `daily_todo_mysql` 保留不動(沙盒沿用)。
- 除「dev-login 註冊條件」一處,**不改任何既有功能邏輯**。
- Port:正式 app `4178`、沙盒 app `4179`、沙盒 DB host `3307`、正式 DB host `3308`(容器內皆 `3306`)。
- 分支 `feature/local-docker-deploy`(spec 已提交於此)。

---

## Task 1: 容器化 App(Dockerfile + .dockerignore)

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Produces:可 build 的 image，runtime 內含 `dist/index.js` + `dist/public/**` + 正式 `node_modules`，`CMD node dist/index.js`，預設 `NODE_ENV=production`。後續 Task 3 的 compose 以 `build: .` 取用。
- 事實依據:`pnpm build` 產出 `dist/index.js`(esbuild，`--packages=external` → runtime 需要 node_modules)與 `dist/public/**`(vite,`outDir=dist/public`)。正式時 `serveStatic` 從 `import.meta.dirname/public` 取靜態檔,即 `/app/dist/public`。

- [ ] **Step 1: 寫 `.dockerignore`**

```
node_modules
dist
.git
.gitignore
uploads
.env
.env.*
*.log
.manus
.manus-logs
.superpowers
docs
**/*.test.ts
**/*.spec.ts
.DS_Store
```

- [ ] **Step 2: 寫 `Dockerfile`(多階段)**

```dockerfile
# syntax=docker/dockerfile:1

# ---- build stage: 安裝全部依賴並打包 ----
FROM node:22-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable
# 先複製鎖檔 + patches 以利快取
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
# 複製其餘原始碼並 build(vite -> dist/public, esbuild -> dist/index.js)
COPY . .
RUN pnpm build
# 砍掉 devDependencies,只留 runtime 需要的 node_modules
RUN pnpm prune --prod

# ---- runtime stage: 精簡執行環境 ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# uploads 由 compose 掛 volume;先建好目錄
RUN mkdir -p uploads
EXPOSE 4178
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: build image 驗證**

Run:
```bash
docker build -t daily-todo-app:prod .
```
Expected: build 成功,結尾 `naming to docker.io/library/daily-todo-app:prod`。若 `pnpm build` 階段失敗,先在主機跑 `pnpm run build` 排除程式問題再重試。

- [ ] **Step 4: 確認 image 內容正確**

Run:
```bash
docker run --rm daily-todo-app:prod sh -c "ls dist && ls dist/public/index.html"
```
Expected: 列出 `index.js`、`public`,且 `dist/public/index.html` 存在(不報 No such file)。

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build(docker): multi-stage Dockerfile + dockerignore for production image"
```

---

## Task 2: 登入開關 + 沙盒 dev port(server 改動)

**Files:**
- Modify: `server/_core/index.ts`(dev-login 註冊條件,約 43-45 行)
- Modify: `server/_core/env.ts`(新增 `allowDevLogin` 旗標,約 1-11 行)
- Modify: `.env`(本地檔,非追蹤:`PORT` 4178 → 4179)

**Interfaces:**
- Consumes:`process.env.ALLOW_DEV_LOGIN`、`process.env.NODE_ENV`、`process.env.PORT`。
- Produces:`ENV.allowDevLogin: boolean`;`/api/dev-login` 在「`NODE_ENV==="development"` 或 `ALLOW_DEV_LOGIN==="1"`」時註冊。Task 3 的 `.env.prod` 會設 `ALLOW_DEV_LOGIN=1`。

- [ ] **Step 1: 在 `env.ts` 加旗標**

把 `server/_core/env.ts` 的 `ENV` 物件加一行(放在 `isProduction` 後):
```ts
  isProduction: process.env.NODE_ENV === "production",
  allowDevLogin: process.env.NODE_ENV === "development" || process.env.ALLOW_DEV_LOGIN === "1",
```

- [ ] **Step 2: 改 `index.ts` 的註冊條件**

把 `server/_core/index.ts` 現有區塊:
```ts
  // Dev-only login bypass (no Manus OAuth server needed locally)
  if (process.env.NODE_ENV === "development") {
    registerDevAuthRoutes(app);
  }
```
改成(新增 import `ENV`,若尚未 import):
```ts
  // Dev login bypass: in development, or when explicitly enabled for local self-hosting
  // (ALLOW_DEV_LOGIN=1). Stays OFF by default so a real cloud deploy never exposes it.
  if (ENV.allowDevLogin) {
    registerDevAuthRoutes(app);
  }
```
於檔案頂端 import 區補:`import { ENV } from "./env";`(若已存在則略)。

- [ ] **Step 3: 型別檢查**

Run: `pnpm run check`
Expected: 0 錯。

- [ ] **Step 4: 沙盒 dev port 改 4179**

編輯本地 `.env`,把 `PORT=4178` 改成 `PORT=4179`(此檔 gitignore,不進版控)。

- [ ] **Step 5: 手動驗證 dev 仍可登入(沙盒)**

Run(背景啟動,確認後關閉):
```bash
docker compose up -d
pnpm dev
```
開 `http://localhost:4179/api/dev-login`,Expected: 302 轉回 `/` 且可進入 app。確認後停掉 dev。

- [ ] **Step 6: Commit**

```bash
git add server/_core/index.ts server/_core/env.ts
git commit -m "feat(auth): gate dev-login behind ALLOW_DEV_LOGIN for local self-hosting"
```
(`.env` 為 gitignore,不會被加入。)

---

## Task 3: 正式 stack(compose + env 範本 + gitignore)

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.prod.example`
- Create: `.env.prod`(本地,gitignore;由範本複製填值)
- Modify: `.gitignore`(補 `.env.prod`、`.env.test`)

**Interfaces:**
- Consumes:Task 1 的 Dockerfile(`build: .`)、Task 2 的 `ALLOW_DEV_LOGIN`。
- Produces:`daily-todo-app:prod` image 標籤、正式 MySQL(host 3308)、volume `daily_todo_prod_mysql` / `daily_todo_prod_uploads`。Task 4 的 `deploy.sh` 取用本檔。
- 容器內連線:app 以 `db:3306` 連 MySQL;主機工具以 `127.0.0.1:3308` 連線。

- [ ] **Step 1: 寫 `docker-compose.prod.yml`**

```yaml
services:
  db:
    image: mysql:8.0
    container_name: daily-todo-mysql-prod
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root}
      MYSQL_DATABASE: daily_todo
      MYSQL_USER: daily
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-daily_prod}
    ports:
      - "3308:3306"   # host 3308 -> container 3306 (與沙盒 3307 區隔)
    volumes:
      - daily_todo_prod_mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD:-root}"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    build: .
    image: daily-todo-app:prod
    container_name: daily-todo-app-prod
    restart: unless-stopped
    env_file: .env.prod
    ports:
      - "4178:4178"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - daily_todo_prod_uploads:/app/uploads

volumes:
  daily_todo_prod_mysql:
  daily_todo_prod_uploads:
```

- [ ] **Step 2: 寫 `.env.prod.example`(提交範本,不含真值)**

```bash
# 正式環境設定範本 — 複製成 .env.prod 並填入真值(.env.prod 不進版控)
# 容器內 app 以服務名 db 連線
DATABASE_URL=mysql://daily:CHANGE_ME_PW@db:3306/daily_todo
# 主機跑 migration 用(deploy.sh 取用):連 published port 3308
MIGRATE_DATABASE_URL=mysql://daily:CHANGE_ME_PW@127.0.0.1:3308/daily_todo
# MySQL 容器密碼(需與上面 URL 內的密碼一致)
MYSQL_ROOT_PASSWORD=CHANGE_ME_ROOT
MYSQL_PASSWORD=CHANGE_ME_PW

PORT=4178
NODE_ENV=production
JWT_SECRET=CHANGE_ME_LONG_RANDOM
VITE_APP_ID=local-prod
OWNER_OPEN_ID=dev-user
OAUTH_SERVER_URL=
# 本地自架:開放 dev-login(雲端部署請勿設定)
ALLOW_DEV_LOGIN=1
# solve-problem 功能用
OPENAI_API_KEY=CHANGE_ME_OPENAI_KEY
```

- [ ] **Step 3: 由範本建立本地 `.env.prod` 並填真值**

```bash
cp .env.prod.example .env.prod
```
編輯 `.env.prod`:把所有 `CHANGE_ME_*` 換成真值 —— `MYSQL_PASSWORD` 與兩條 URL 內密碼一致(例如 `daily_prod`)、`MYSQL_ROOT_PASSWORD` 設一個 root 密碼、`JWT_SECRET` 用 `openssl rand -hex 32` 產生、`OPENAI_API_KEY` 填可用金鑰(沿用現有 `.env` 內那把,或換新)。

- [ ] **Step 4: 更新 `.gitignore`**

在 `.gitignore` 的環境變數區塊(`.env` 那段)後補兩行:
```
.env.prod
.env.test
```

- [ ] **Step 5: compose 語法驗證**

Run:
```bash
docker compose -f docker-compose.prod.yml config >/dev/null && echo OK
```
Expected: 印出 `OK`(語法正確、變數可解析)。

- [ ] **Step 6: 確認 `.env.prod` 未被追蹤**

Run: `git status --porcelain .env.prod`
Expected: 無輸出(被 gitignore)。

- [ ] **Step 7: Commit**

```bash
git add docker-compose.prod.yml .env.prod.example .gitignore
git commit -m "build(docker): production compose stack + env template + gitignore"
```

---

## Task 4: 一鍵部署(deploy.sh + package.json 指令)

**Files:**
- Create: `scripts/deploy.sh`
- Modify: `package.json`(scripts 區塊,約 6-15 行)

**Interfaces:**
- Consumes:Task 3 的 `.env.prod`(含 `MIGRATE_DATABASE_URL`)、`docker-compose.prod.yml`、Task 1 的 Dockerfile。
- Produces:`pnpm deploy`、`pnpm prod:up` / `prod:down` / `prod:logs`。
- 流程:起 DB → 等 healthy → 對正式 DB `drizzle-kit migrate` → build app image → 起 app。

- [ ] **Step 1: 寫 `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"

if [ ! -f .env.prod ]; then
  echo "❌ 找不到 .env.prod。請先執行: cp .env.prod.example .env.prod 並填入真值。" >&2
  exit 1
fi

# 載入 .env.prod(取得 MIGRATE_DATABASE_URL 等)
set -a; . ./.env.prod; set +a

if [ -z "${MIGRATE_DATABASE_URL:-}" ]; then
  echo "❌ .env.prod 缺少 MIGRATE_DATABASE_URL。" >&2
  exit 1
fi

echo "▶ 1/4 啟動正式 MySQL ..."
$COMPOSE up -d db

echo "▶ 2/4 等待 MySQL healthy ..."
for i in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' daily-todo-mysql-prod 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then echo "   MySQL ready"; break; fi
  if [ "$i" = "40" ]; then echo "❌ MySQL 等待逾時" >&2; exit 1; fi
  sleep 2
done

echo "▶ 3/4 對正式 DB 跑 migration ..."
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm drizzle-kit migrate

echo "▶ 4/4 build image 並啟動正式 app ..."
$COMPOSE build app
$COMPOSE up -d app

echo "✅ 正式已上線:http://localhost:${PORT:-4178}"
```

- [ ] **Step 2: 給執行權限**

Run: `chmod +x scripts/deploy.sh`

- [ ] **Step 3: 在 `package.json` 加指令**

把 scripts 區塊內 `"import:frameworks"` 那行之後補上:
```json
    "import:frameworks": "tsx --env-file=.env server/scripts/import-frameworks.ts",
    "deploy": "bash scripts/deploy.sh",
    "prod:up": "docker compose -f docker-compose.prod.yml up -d",
    "prod:down": "docker compose -f docker-compose.prod.yml down",
    "prod:logs": "docker compose -f docker-compose.prod.yml logs -f app"
```
(注意逗號:原本 `import:frameworks` 是最後一項、行尾無逗號;補逗號後再接新行。)

- [ ] **Step 4: 跑一次完整部署**

Run: `pnpm deploy`
Expected: 依序印 1/4 ~ 4/4,結尾 `✅ 正式已上線:http://localhost:4178`,無錯誤離開(exit 0)。

- [ ] **Step 5: 驗證正式可用 + 登入**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4178/
curl -sS -o /dev/null -w "%{http_code}\n" -L http://localhost:4178/api/dev-login
```
Expected: 第一條回 `200`;第二條(跟隨轉址後)回 `200`。

- [ ] **Step 6: 驗證 Docker Desktop 一鍵開關語意(CLI 等效)**

Run:
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d   # 等同 Docker Desktop 點啟動
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4178/
```
Expected: 最後回 `200`(用既有 image 秒起、資料還在,無需重新 build)。

- [ ] **Step 7: Commit**

```bash
git add scripts/deploy.sh package.json
git commit -m "feat(deploy): one-command pnpm deploy + prod up/down/logs scripts"
```

---

## Task 5: 測試 DB 分離 + 修綠 4 個失敗測試

**Files:**
- Create: `scripts/setup-test-db.sh`
- Create: `.env.test`(本地,gitignore)
- Modify: `vitest.config.ts`(頂端載入 `.env.test`)
- Modify: `package.json`(加 `db:setup:test`)

**Interfaces:**
- Consumes:沙盒 MySQL 容器 `daily-todo-mysql`(host 3307)。
- Produces:`daily_todo_test` 資料庫 + 已套用 migration;`pnpm test` 連測試庫,不污染沙盒 `daily_todo`。
- 事實依據:`server/db.ts` 的 `getDb()` 直接讀 `process.env.DATABASE_URL`;`vitest.config.ts` 目前不載入任何 env。現況 4 個失敗測試(`recurring-deletion` ×3、`tasks` 統計 ×1)需真實 DB。

- [ ] **Step 1: 先重現「紅燈」**

Run:
```bash
docker compose up -d   # 確保沙盒 MySQL 起著
pnpm test
```
Expected: 79 passed / 4 failed(`recurring-deletion`、`tasks` 相關,因無可用測試 DB)。記下失敗測試名。

- [ ] **Step 2: 寫 `scripts/setup-test-db.sh`(建庫 + 授權 + migrate)**

```bash
#!/usr/bin/env bash
set -euo pipefail

# 在沙盒 MySQL 容器(daily-todo-mysql)建立測試專用資料庫並套用 migration。
# 即使沙盒 volume 已存在(init SQL 不會再跑)也能補建。
docker exec daily-todo-mysql mysql -uroot -proot -e \
  "CREATE DATABASE IF NOT EXISTS daily_todo_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; \
   GRANT ALL PRIVILEGES ON daily_todo_test.* TO 'daily'@'%'; FLUSH PRIVILEGES;"

DATABASE_URL="mysql://daily:daily_dev@127.0.0.1:3307/daily_todo_test" pnpm drizzle-kit migrate
echo "✅ 測試 DB daily_todo_test 已就緒"
```
(沙盒 root 密碼 `root`、`daily` 密碼 `daily_dev`、port 3307 皆取自現有 `docker-compose.yml`。)

- [ ] **Step 3: 給執行權限**

Run: `chmod +x scripts/setup-test-db.sh`

- [ ] **Step 4: 寫 `.env.test`(本地)**

```bash
DATABASE_URL=mysql://daily:daily_dev@127.0.0.1:3307/daily_todo_test
JWT_SECRET=test-secret
VITE_APP_ID=test
OWNER_OPEN_ID=dev-user
NODE_ENV=test
```

- [ ] **Step 5: 讓 vitest 載入 `.env.test`**

在 `vitest.config.ts` 最頂端(`import` 之後、`defineConfig` 之前)加:
```ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.test", override: true });
```
(`dotenv` 已是相依套件。`override: true` 確保測試一律連測試庫,不被外部 `DATABASE_URL` 影響。)

- [ ] **Step 6: 在 `package.json` 加 setup 指令**

於 Task 4 新增的指令後再補一行:
```json
    "db:setup:test": "bash scripts/setup-test-db.sh"
```
(同樣注意前一行補逗號。)

- [ ] **Step 7: 建測試 DB 並跑「綠燈」**

Run:
```bash
pnpm db:setup:test
pnpm test
```
Expected: 83 passed / 0 failed(原 4 個轉綠)。

- [ ] **Step 8: 驗證沙盒資料未被污染**

Run:
```bash
docker exec daily-todo-mysql mysql -uroot -proot -e \
  "SELECT COUNT(*) AS test_tasks FROM daily_todo_test.tasks; SELECT COUNT(*) AS sandbox_tasks FROM daily_todo.tasks;"
```
Expected: 兩庫各自獨立(測試庫有資料時,沙盒庫筆數不因跑測試而改變)。

- [ ] **Step 9: Commit**

```bash
git add scripts/setup-test-db.sh vitest.config.ts package.json
git commit -m "test(db): isolated daily_todo_test database; fix 4 DB-dependent tests"
```
(`.env.test` 為 gitignore,不會被加入。)

---

## Self-Review

**Spec coverage:**
- 兩套環境定義(正式純 Docker / 沙盒 dev、各 port、各 DB、各 volume)→ Task 1 + Task 3 + Task 2 Step 4 ✅
- Dockerfile 多階段 + .dockerignore → Task 1 ✅
- `docker-compose.prod.yml`(app+db、3308、volumes)→ Task 3 ✅
- `.env` PORT→4179、`.env.prod`/範本、`.gitignore` 補 → Task 2 Step 4 / Task 3 ✅
- 登入修正(`ALLOW_DEV_LOGIN`)→ Task 2 ✅
- `pnpm deploy` 四步流程 + prod up/down/logs → Task 4 ✅
- Docker Desktop 一鍵開關語意 → Task 4 Step 6 ✅
- 測試 DB 分離 + 修綠 4 測試 → Task 5 ✅
- 資料隔離驗收 → Task 4 Step 6 / Task 5 Step 8 ✅
- migration 主機連 3308 / 容器連 db:3306 區隔 → Task 3 Step 2 / Task 4 Step 1 ✅

**Placeholder scan:** 無 TBD/TODO。`CHANGE_ME_*` 為 env 範本佔位(設計要求使用者填真值),非計畫缺漏;Task 3 Step 3 明確說明各值如何產生。

**Type consistency:** `ENV.allowDevLogin`(Task 2 Step 1 定義)於 Task 2 Step 2 消費,一致。env 變數名 `MIGRATE_DATABASE_URL`(Task 3 範本定義)於 Task 4 deploy.sh 消費,一致。容器名 `daily-todo-mysql-prod`(Task 3)於 Task 4 健康檢查輪詢一致;沙盒容器名 `daily-todo-mysql`(現有)於 Task 5 一致。Port(4178/4179/3307/3308)全計畫一致。
