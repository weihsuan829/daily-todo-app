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
# Note: pnpm prune --prod is intentionally omitted because esbuild bundles vite.ts
# with --packages=external, leaving top-level `import ... from "vite"` in dist/index.js
# that requires vite to be present at runtime.

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
