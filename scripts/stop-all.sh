#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="digital-twin"
PID_DIR="$ROOT/.dev-pids"
LAUNCH_DIR="$ROOT/.mac-launch-agents"
LABELS="api worker socket editor runtime"

info() { printf '\033[36m%s\033[0m\n' "$*"; }
success() { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

kill_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

stop_screen_sessions() {
  local name session
  if ! command -v screen >/dev/null 2>&1; then
    return 0
  fi
  for name in $LABELS; do
    session="digital-twin-${name}"
    screen -S "$session" -X quit >/dev/null 2>&1 || true
  done
}

stop_launch_agents() {
  local name label plist
  for name in $LABELS; do
    label="com.digital-twin.scene.${name}"
    plist="$LAUNCH_DIR/${label}.plist"
    if command -v launchctl >/dev/null 2>&1; then
      launchctl bootout "gui/$UID/$label" >/dev/null 2>&1 || true
      [ -f "$plist" ] && launchctl bootout "gui/$UID" "$plist" >/dev/null 2>&1 || true
    fi
  done
}

kill_recorded_processes() {
  [ -d "$PID_DIR" ] || return 0
  local file pid
  for file in "$PID_DIR"/*.pid; do
    [ -f "$file" ] || continue
    pid=$(cat "$file" 2>/dev/null || true)
    kill_pid "$pid"
    rm -f "$file"
  done
}

kill_remaining_project_processes() {
  local pids pid command
  pids=$(pgrep -f "$ROOT" || true)
  for pid in $pids; do
    [ "$pid" != "$$" ] || continue
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$command" in
      *vite.js*|*tsx*watch*src/main.ts*|*tsx*loader.mjs*src/main.ts*|*pnpm*dev*)
        # 只匹配当前仓库路径，避免误杀其他本地项目的 Node/Vite 服务。
        kill_pid "$pid"
        ;;
    esac
  done
}

cd "$ROOT"
info "[1/2] Stopping API, worker, Socket and web apps..."
stop_screen_sessions
stop_launch_agents
kill_recorded_processes
kill_remaining_project_processes
sleep 1
kill_remaining_project_processes

info "[2/2] Stopping project Docker containers..."
if command -v docker >/dev/null 2>&1 && docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  docker compose -p "$PROJECT_NAME" stop
else
  warn "Docker engine is not running; containers are already unavailable."
fi

success "Project stopped successfully. Database and MinIO data have been preserved."
