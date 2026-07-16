#!/bin/sh
set -eu

api_pid=''
worker_pid=''

cleanup() {
  [ -z "$api_pid" ] || kill "$api_pid" 2>/dev/null || true
  [ -z "$worker_pid" ] || kill "$worker_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 避免 API 与 Worker 同时 prisma generate 写同一 client；E2E 启动前只生成一次。
pnpm --filter @digital-twin/api-server exec prisma generate
pnpm --filter @digital-twin/api-server exec tsx watch src/main.ts &
api_pid=$!
pnpm --filter @digital-twin/asset-worker exec tsx watch src/main.ts &
worker_pid=$!

# Playwright 结束时会终止本脚本，trap 负责回收两个 watch 子进程。
wait "$api_pid" "$worker_pid"
