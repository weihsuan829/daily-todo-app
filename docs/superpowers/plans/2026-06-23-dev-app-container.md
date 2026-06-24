# 開發版 App 容器化(熱重載)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開發版 app 跑在容器(與開發 DB 同組,Docker Desktop 看得到 app+DB),保留熱重載;`docker compose up -d` 一次起 app+DB。

**Architecture:** Dockerfile 加 `dev` 階段(裝依賴、`CMD pnpm dev`,不複製原始碼);`docker-compose.yml` 加 `app` 服務(bind-mount 原始碼 + node_modules 具名 volume + env 走服務名 db);`vite.config.ts` 在 `VITE_USE_POLLING=1` 時開檔案輪詢。

**Tech Stack:** Docker / docker compose、Node 22 + pnpm、Vite(middleware HMR)、tsx。

## Global Constraints

- 用 **pnpm**。
- 不破壞正式環境(`docker-compose.prod.yml` / 部署)與既有測試(`pnpm test` 維持 83 綠)。
- `pnpm run check` 0 錯;`pnpm run build` 仍成功(vite.config 改動不可破壞正式 build)。
- 沙盒專案名 `daily-todo`、開發 DB 容器 `daily-todo-mysql`(3307)、volume `daily-todo_daily_todo_mysql` 不變。
- 開發 app port 4179。

---

## Task 1: Dockerfile 加 `dev` 階段 + vite polling

**Files:**
- Modify: `Dockerfile`(尾端新增 dev 階段)
- Modify: `vite.config.ts`(server.watch)

- [ ] **Step 1: Dockerfile 加 dev 階段**

在 `Dockerfile` 末端(`CMD ["node", "dist/index.js"]` 之後)新增:
```dockerfile

# ---- dev stage: 熱重載開發(原始碼由 compose bind-mount 進來)----
FROM node:22-slim AS dev
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=development
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
EXPOSE 4179
CMD ["pnpm", "dev"]
```

- [ ] **Step 2: vite.config.ts 開檔案輪詢(僅 VITE_USE_POLLING=1)**

在 `vite.config.ts` 的 `server:` 區塊內,`host: true,` 之後加一行:
```ts
  server: {
    host: true,
    watch: { usePolling: !!process.env.VITE_USE_POLLING },
    allowedHosts: [
```
(其餘 server 設定不動。)

- [ ] **Step 3: 確認正式 build 未被破壞**

Run: `pnpm run check && pnpm run build`
Expected: tsc 0 錯;build 成功(`dist/index.js` + `dist/public/` 產出)。

- [ ] **Step 4: Commit**

```bash
git add Dockerfile vite.config.ts
git commit -m "build(dev): add Dockerfile dev stage + opt-in vite watch polling"
```

---

## Task 2: docker-compose.yml 加 app 服務並啟動驗收

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes:Task 1 的 Dockerfile `dev` 階段 + `VITE_USE_POLLING`。

- [ ] **Step 1: 加 `app` 服務 + node_modules volume**

把 `docker-compose.yml` 改成(在既有 `db` 服務後加 `app`,並在 `volumes:` 加具名 volume):
```yaml
name: daily-todo

services:
  db:
    image: mysql:8.0
    container_name: daily-todo-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: daily_todo
      MYSQL_USER: daily
      MYSQL_PASSWORD: daily_dev
    ports:
      - "3307:3306"
    volumes:
      - daily_todo_mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    build:
      context: .
      target: dev
    image: daily-todo-app:dev
    container_name: daily-todo-app-dev
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "4179:4179"
    environment:
      DATABASE_URL: mysql://daily:daily_dev@db:3306/daily_todo
      PORT: "4179"
      NODE_ENV: development
      OWNER_OPEN_ID: dev-user
      JWT_SECRET: local-dev-secret
      VITE_APP_ID: local-dev
      VITE_USE_POLLING: "1"
    volumes:
      - ./:/app
      - daily_todo_dev_node_modules:/app/node_modules

volumes:
  daily_todo_mysql:
  daily_todo_dev_node_modules:
```
(沿用既有 `db` 設定值不變;只新增 `name:`(若未存在)、`app` 服務、`daily_todo_dev_node_modules` volume。注意:`docker-compose.yml` 開頭可能已有 `name: daily-todo`(部署修正時加的)— 若已有就別重複。)

- [ ] **Step 2: compose 語法驗證**

Run: `docker compose config >/dev/null && echo OK`
Expected: 印 `OK`。

- [ ] **Step 3: 停掉主機上可能佔 4179 的 dev server**

Run: `pkill -f "server/_core/index.ts" 2>/dev/null; echo done`
(避免主機 pnpm dev 與容器搶 4179。)

- [ ] **Step 4: 起 app + DB**

Run: `docker compose up -d --build`
Expected: 先 build `dev` image,db 起來 healthy 後 app 啟動。首次 build + 容器內 install 會花數分鐘。

- [ ] **Step 5: 等 app 就緒並驗收**

Run:
```bash
for i in $(seq 1 60); do
  docker logs daily-todo-app-dev 2>&1 | grep -q "Server running on http://localhost:4179/" && { echo ready; break; }
  sleep 3
done
docker compose ps
curl -sS -o /dev/null -w "4179/=%{http_code}\n" http://localhost:4179/
curl -sS -o /dev/null -w "dev-login=%{http_code}\n" -L http://localhost:4179/api/dev-login
```
Expected: `daily-todo-app-dev` 與 `daily-todo-mysql` 皆 Up;`4179/`=200;`dev-login`=200。

- [ ] **Step 6: 資料 + 熱重載抽查**

- 開 `http://localhost:4179`(必要時先 `/api/dev-login`),確認看得到先前還原的開發資料(32 tasks、2 projects…)。
- 改一個前端檔案(例如某元件可見文字)存檔,觀察瀏覽器於數秒內自動更新(HMR / reload)。改回去存檔。

- [ ] **Step 7: 確認正式不受影響**

Run: `curl -sS -o /dev/null -w "4178/=%{http_code}\n" http://localhost:4178/`
Expected: 200(正式持續運作)。

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(dev): containerized dev app (hot reload) alongside sandbox db"
```

---

## Self-Review

**Spec coverage:**
- Dockerfile dev 階段 → Task 1 Step 1 ✅
- vite polling(opt-in)→ Task 1 Step 2 ✅
- compose app 服務(bind-mount + node_modules volume + env 走 db:3306 + 4179 + depends_on healthy)→ Task 2 Step 1 ✅
- `docker compose up -d` 一次起 app+DB、Docker Desktop 同組 → Task 2 Step 4-5 ✅
- 熱重載 + 資料抽查 → Task 2 Step 6 ✅
- 正式不受影響 / 測試 build 不破 → Task 1 Step 3 / Task 2 Step 7 ✅

**Placeholder scan:** 無 TBD/TODO。env 值(daily_dev / local-dev-secret 等)沿用既有沙盒慣例,非佔位。

**Type consistency:** `VITE_USE_POLLING`(Task 1 Step 2 讀取 / Task 2 Step 1 設定)一致;Dockerfile target `dev`(Task 1 定義 / Task 2 `target: dev` 取用)一致;service `db` 名稱與 4179 port 全計畫一致。
