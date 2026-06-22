#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"

if [ ! -f .env.prod ]; then
  echo "❌ 找不到 .env.prod。請先執行: cp .env.prod.example .env.prod 並填入真值。" >&2
  exit 1
fi

# 載入 .env.prod（取得 MIGRATE_DATABASE_URL 等）
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
  if [ "$status" = "healthy" ]; then echo "   MySQL ready"; sleep 2; break; fi
  if [ "$i" = "40" ]; then echo "❌ MySQL 等待逾時" >&2; exit 1; fi
  sleep 2
done

echo "▶ 3/4 對正式 DB 跑 migration ..."
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm drizzle-kit migrate

echo "▶ 4/4 build image 並啟動正式 app ..."
$COMPOSE build app
$COMPOSE up -d app

echo "✅ 正式已上線：http://localhost:${PORT:-4178}"
