# 開發版 App 容器化(熱重載)— 設計文件

- 日期:2026-06-23
- 狀態:設計已確認(使用者同意),待寫實作計畫
- 範圍:`daily-todo-app` 的開發(沙盒)環境;分支 `feature/local-docker-deploy`

## 1. 目標

把開發版的 app 也包進容器,和開發 DB 同一組(Docker Desktop 的 `daily-todo` 專案底下看得到 app + DB 兩個容器),**同時保留熱重載**(改主機上的程式碼即時生效)。`docker compose up -d` 一次起 app + DB。

## 2. 背景與限制

- 現況:開發 DB 在容器(沙盒,3307),app 跑在主機 `pnpm dev`(熱重載,4179),所以 Docker Desktop 只看得到 DB。
- macOS 主機 + Linux 容器:node_modules 含平台原生二進位(esbuild 等)不相容,容器**不能共用**主機的 node_modules,需自備一份。
- macOS bind-mount 下檔案監看常需開 polling,HMR 才可靠偵測變動。

## 3. 做法

### 3.1 Dockerfile 加 `dev` 階段
新增一個 `dev` build target(與既有 build/runtime 並存):
- `FROM node:22-slim`、`corepack enable`
- 複製 `package.json` / `pnpm-lock.yaml` / `patches`,`pnpm install --frozen-lockfile`(裝 Linux 版完整依賴,含 devDeps)
- **不複製原始碼**(原始碼由 compose bind-mount 進來)
- `CMD ["pnpm", "dev"]`、`ENV NODE_ENV=development`

### 3.2 `docker-compose.yml` 加 `app` 服務(沙盒專案 `daily-todo`)
- `build: { context: ., target: dev }`、`image: daily-todo-app:dev`
- `volumes`:
  - `./:/app`(bind-mount 原始碼,熱重載來源)
  - `daily_todo_dev_node_modules:/app/node_modules`(具名 volume 蓋住 node_modules,用容器自己 Linux 版的依賴;首次由 image 內已裝好的 node_modules 初始化)
- `ports: "4179:4179"`
- `depends_on: { db: { condition: service_healthy } }`
- `environment`:
  - `DATABASE_URL=mysql://daily:daily_dev@db:3306/daily_todo`(容器內走服務名 `db`)
  - `PORT=4179`、`NODE_ENV=development`
  - `OWNER_OPEN_ID=dev-user`、`JWT_SECRET=local-dev-secret`、`VITE_APP_ID=local-dev`
  - `VITE_USE_POLLING=1`(開檔案輪詢監看)
- `restart: unless-stopped`

### 3.3 Vite 檔案監看(`vite.config.ts`)
在 `server` 設定加:
```ts
server: {
  watch: { usePolling: !!process.env.VITE_USE_POLLING },
  // 既有設定保留
}
```
只有在 `VITE_USE_POLLING=1`(即容器內)時才開 polling;主機 `pnpm dev` 不受影響。

### 3.4 `.dockerignore`
確認不會把主機 `node_modules` / `dist` 帶進 build context(現有規則已排除),`dev` 階段只需 lockfile + package.json + patches。

## 4. 資料流

- 容器 app(:4179)→ 服務名 `db:3306` 連開發 MySQL(資料 = 先前還原的 32 tasks 等)。
- 主機編輯原始碼 → bind-mount 即時同步進容器 → Vite(polling)偵測 → HMR 更新瀏覽器。

## 5. 不做(YAGNI)

- 不動正式那套(`docker-compose.prod.yml` / 部署流程)。
- 不移除主機 `pnpm dev` 的能力(仍可擇一使用;兩者都用 4179,不可同時)。
- 不為開發容器做 image 瘦身(dev 本就需要 devDeps)。

## 6. Global Constraints

- 用 **pnpm**。
- 不破壞正式環境與既有測試(`pnpm test` 維持 83 綠)。
- `pnpm run check` 0 錯、`pnpm run build` 仍成功(vite.config 改動不可破壞正式 build)。
- 沙盒專案名維持 `daily-todo`、開發 DB 容器 `daily-todo-mysql`(3307)、資料 volume `daily-todo_daily_todo_mysql` 不變。

## 7. 驗收

1. `docker compose up -d` → Docker Desktop `daily-todo` 組顯示 `app` + `db` 兩容器,皆 Up。
2. `localhost:4179/` 回 200、`/api/dev-login` 回 200。
3. 登入後看得到先前還原的開發資料(32 tasks、2 projects…)。
4. 改一個前端檔案(例如某元件文字)存檔 → 瀏覽器於數秒內自動更新(HMR / reload)。
5. `pnpm run check` 0 錯;`pnpm run build` 成功(正式 build 未被 vite.config 改動破壞)。
6. 正式環境(:4178)不受影響、持續運作。
