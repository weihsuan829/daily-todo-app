#!/usr/bin/env bash
set -euo pipefail

# 在沙盒 MySQL 容器(daily-todo-mysql)建立測試專用資料庫並套用 migration。
# 即使沙盒 volume 已存在(init SQL 不會再跑)也能補建。
docker exec daily-todo-mysql mysql -uroot -proot -e \
  "CREATE DATABASE IF NOT EXISTS daily_todo_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; \
   GRANT ALL PRIVILEGES ON daily_todo_test.* TO 'daily'@'%'; FLUSH PRIVILEGES;"

DATABASE_URL="mysql://daily:daily_dev@127.0.0.1:3307/daily_todo_test" pnpm drizzle-kit migrate
echo "✅ 測試 DB daily_todo_test 已就緒"
