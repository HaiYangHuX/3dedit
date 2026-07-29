#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="digital-twin"
PID_DIR="$ROOT/.dev-pids"
REQUIRED_PNPM="10.12.1"
mkdir -p "$PID_DIR"

info() { printf '\033[36m%s\033[0m\n' "$*"; }
success() { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

load_dotenv_value() {
  local key="$1"
  [ -f "$ROOT/.env" ] || return 1
  sed -n "s/^${key}=//p" "$ROOT/.env" | tail -n 1
}

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pick_port() {
  local preferred="$1"
  shift
  if ! port_is_listening "$preferred"; then
    printf '%s' "$preferred"
    return 0
  fi
  local candidate
  for candidate in "$@"; do
    if ! port_is_listening "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

compose_host_port() {
  local service="$1"
  local container_port="$2"
  local line
  line=$(docker compose -p "$PROJECT_NAME" port "$service" "$container_port" 2>/dev/null | head -n 1 || true)
  [ -n "$line" ] || return 1
  printf '%s' "${line##*:}"
}

find_lan_ip() {
  local iface ip
  iface=$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)
  if [ -n "$iface" ]; then
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    if [ -n "$ip" ]; then
      printf '%s' "$ip"
      return 0
    fi
  fi
  ip=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}' || true)
  printf '%s' "${ip:-127.0.0.1}"
}

setup_node24() {
  local candidates=(
    "/opt/homebrew/opt/node@24/bin"
    "/usr/local/opt/node@24/bin"
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  )
  local dir
  for dir in "${candidates[@]}"; do
    if [ -x "$dir/node" ]; then
      PATH="$dir:$PATH"
      if node -e 'const v=process.versions.node.split(".").map(Number); process.exit(v[0] === 24 ? 0 : 1)' >/dev/null 2>&1; then
        export PATH
        return 0
      fi
    fi
  done
  if command_exists node && node -e 'const v=process.versions.node.split(".").map(Number); process.exit(v[0] === 24 ? 0 : 1)' >/dev/null 2>&1; then
    return 0
  fi
  fail "Node.js 24 was not found. Install it with: brew install node@24"
}

ensure_docker_ready() {
  command_exists docker || fail "Docker was not found. Install Docker Desktop first."
  if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    return 0
  fi

  if [ -d "/Applications/Docker.app" ]; then
    warn "Docker engine is offline. Starting Docker Desktop..."
    open -a Docker
    local attempt
    for attempt in $(seq 1 30); do
      sleep 2
      if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
        return 0
      fi
    done
  fi
  fail "Docker engine did not become ready within 60 seconds."
}

process_matches_root() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | grep -F "$ROOT" >/dev/null 2>&1
}

assert_dev_ports_available_or_running() {
  local running=0
  if curl -fsS "http://127.0.0.1:3100/api/health" >/dev/null 2>&1 && \
     curl -fsS "http://127.0.0.1:5173/" >/dev/null 2>&1 && \
     curl -fsS "http://127.0.0.1:5174/" >/dev/null 2>&1; then
    running=1
  fi

  local port pid foreign=""
  for port in 3100 5173 5174 "$SOCKET_PORT"; do
    while read -r pid; do
      [ -n "$pid" ] || continue
      if ! process_matches_root "$pid"; then
        foreign="$foreign $port(pid:$pid)"
      fi
    done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  done

  if [ -n "$foreign" ]; then
    fail "Development ports are occupied by another project:$foreign"
  fi

  if [ "$running" -eq 1 ]; then
    print_urls
    success "Project is already running."
    exit 0
  fi
}

stop_stale_project_processes() {
  local pids pid
  pids=$(pgrep -f "$ROOT" || true)
  for pid in $pids; do
    [ "$pid" != "$$" ] || continue
    case "$(ps -p "$pid" -o command= 2>/dev/null || true)" in
      *vite.js*|*tsx*watch*src/main.ts*|*tsx*loader.mjs*src/main.ts*|*pnpm*dev*)
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done
  sleep 1
}

resolve_tool_bins() {
  NODE_BIN="$(command -v node)"
  TSX_BIN=$(find "$ROOT/node_modules/.pnpm" -path '*/node_modules/tsx/dist/cli.mjs' -type f | head -n 1)
  VITE_BIN=$(find "$ROOT/node_modules/.pnpm" -path '*/node_modules/vite/bin/vite.js' -type f | head -n 1)
  [ -n "${TSX_BIN:-}" ] || fail "tsx CLI was not found. Run pnpm install first."
  [ -n "${VITE_BIN:-}" ] || fail "Vite CLI was not found. Run pnpm install first."
}

quote_arg() {
  printf '%q' "$1"
}

write_wrapper_script() {
  local name="$1"
  local workdir="$2"
  local logfile="$3"
  shift 3
  local wrapper="$PID_DIR/${name}.sh"
  {
    printf '%s\n' '#!/bin/bash'
    printf '%s\n' 'set -euo pipefail'
    printf 'cd %s\n' "$(quote_arg "$workdir")"
    for key in PATH DATABASE_URL REDIS_URL MINIO_ENDPOINT MINIO_PORT MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_USE_SSL MINIO_BUCKET API_PUBLIC_BASE_URL VITE_API_BASE_URL SOCKET_HOST SOCKET_PORT SOCKET_DEMO_INTERVAL_MS SOCKET_DEMO_RADIUS; do
      eval "value=\${$key:-}"
      printf 'export %s=%s\n' "$key" "$(quote_arg "$value")"
    done
    printf ': > %s\n' "$(quote_arg "$ROOT/$logfile")"
    printf ': > %s\n' "$(quote_arg "$ROOT/${logfile%.log}.err.log")"
    printf 'exec '
    local arg
    for arg in "$@"; do
      printf '%s ' "$(quote_arg "$arg")"
    done
    printf '>>%s 2>>%s\n' "$(quote_arg "$ROOT/$logfile")" "$(quote_arg "$ROOT/${logfile%.log}.err.log")"
  } >"$wrapper"
  chmod +x "$wrapper"
  printf '%s' "$wrapper"
}

start_process() {
  local name="$1"
  local workdir="$2"
  local logfile="$3"
  shift 3
  local session="digital-twin-${name}"
  local wrapper
  wrapper=$(write_wrapper_script "$name" "$workdir" "$logfile" "$@")

  # screen 会话与当前 Terminal 脱钩，双击启动脚本退出后开发服务仍持续运行。
  screen -S "$session" -X quit >/dev/null 2>&1 || true
  screen -dmS "$session" "$wrapper"
  sleep 0.5
  screen -ls | awk -v session=".${session}" '$1 ~ session { split($1, a, "."); print a[1]; exit }' >"$PID_DIR/$name.pid" || true
  info "Started $name (screen $session, log $logfile)."
}

wait_for_services() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:3100/api/health" >/dev/null 2>&1 && \
       curl -fsS "http://127.0.0.1:${SOCKET_PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  warn "API startup log:"
  tail -n 30 "$ROOT/api.log" 2>/dev/null || true
  tail -n 30 "$ROOT/api.err.log" 2>/dev/null || true
  warn "Socket startup log:"
  tail -n 30 "$ROOT/socket.log" 2>/dev/null || true
  tail -n 30 "$ROOT/socket.err.log" 2>/dev/null || true
  fail "API or Socket service did not become healthy within 60 seconds."
}

print_urls() {
  local lan_ip="${LAN_IP:-$(find_lan_ip)}"
  local minio_console_port="${MINIO_CONSOLE_PORT:-$(compose_host_port minio 9001 || echo 9001)}"
  printf '\n'
  success "Project URLs:"
  printf '  Editor:   http://localhost:5173\n'
  printf '  Runtime:  http://localhost:5174\n'
  printf '  API docs: http://localhost:3100/api/docs\n'
  printf '  Socket:   ws://127.0.0.1:%s\n' "$SOCKET_PORT"
  printf '  MinIO:    http://localhost:%s\n' "$minio_console_port"
  printf '  LAN Editor:   http://%s:5173\n' "$lan_ip"
  printf '  LAN Runtime:  http://%s:5174\n' "$lan_ip"
  printf '  LAN API docs: http://%s:3100/api/docs\n' "$lan_ip"
  printf '  LAN Socket:   ws://%s:%s\n' "$lan_ip" "$SOCKET_PORT"
  printf '  LAN MinIO:    http://%s:%s\n' "$lan_ip" "$minio_console_port"
}

cd "$ROOT"
LAN_IP="${LAN_IP:-$(find_lan_ip)}"
SOCKET_PORT="${SOCKET_PORT:-$(load_dotenv_value SOCKET_PORT || echo 18080)}"
SOCKET_DEMO_INTERVAL_MS="${SOCKET_DEMO_INTERVAL_MS:-$(load_dotenv_value SOCKET_DEMO_INTERVAL_MS || echo 1000)}"
SOCKET_DEMO_RADIUS="${SOCKET_DEMO_RADIUS:-$(load_dotenv_value SOCKET_DEMO_RADIUS || echo 5)}"

# Socket 端口会被写入启动健康检查与局域网访问地址，必须在启动前拒绝非法值。
case "$SOCKET_PORT" in
  ''|*[!0-9]*) fail "SOCKET_PORT must be an integer between 1 and 65535." ;;
esac
if [ "$SOCKET_PORT" -lt 1 ] || [ "$SOCKET_PORT" -gt 65535 ]; then
  fail "SOCKET_PORT must be an integer between 1 and 65535."
fi
export SOCKET_PORT SOCKET_DEMO_INTERVAL_MS SOCKET_DEMO_RADIUS

info "[1/6] Checking Node.js, pnpm and Docker..."
setup_node24
corepack prepare "pnpm@$REQUIRED_PNPM" --activate >/dev/null
[ "$(pnpm -v)" = "$REQUIRED_PNPM" ] || fail "pnpm $REQUIRED_PNPM activation failed."
ensure_docker_ready
command_exists screen || fail "screen was not found. macOS normally includes /usr/bin/screen."

info "[2/6] Checking development ports..."
assert_dev_ports_available_or_running
stop_stale_project_processes

info "[3/6] Preparing dependency service ports..."
POSTGRES_PORT="$(compose_host_port postgres 5432 || true)"
REDIS_PORT="$(compose_host_port redis 6379 || true)"
MINIO_PORT="$(compose_host_port minio 9000 || true)"
MINIO_CONSOLE_PORT="$(compose_host_port minio 9001 || true)"

POSTGRES_PORT="${POSTGRES_PORT:-$(pick_port "${POSTGRES_PORT:-$(load_dotenv_value POSTGRES_PORT || echo 5432)}" 55432 55433 55434 || true)}"
REDIS_PORT="${REDIS_PORT:-$(pick_port "${REDIS_PORT:-$(load_dotenv_value REDIS_PORT || echo 6379)}" 56379 56380 56381 || true)}"
MINIO_PORT="${MINIO_PORT:-$(pick_port "${MINIO_PORT:-$(load_dotenv_value MINIO_PORT || echo 9000)}" 59000 59002 59004 || true)}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-$(pick_port "${MINIO_CONSOLE_PORT:-$(load_dotenv_value MINIO_CONSOLE_PORT || echo 9001)}" 59001 59003 59005 || true)}"

[ -n "$POSTGRES_PORT" ] || fail "No free PostgreSQL port found."
[ -n "$REDIS_PORT" ] || fail "No free Redis port found."
[ -n "$MINIO_PORT" ] || fail "No free MinIO API port found."
[ -n "$MINIO_CONSOLE_PORT" ] || fail "No free MinIO console port found."

export POSTGRES_PORT REDIS_PORT MINIO_PORT MINIO_CONSOLE_PORT
export DATABASE_URL="postgresql://digital_twin:digital_twin@localhost:${POSTGRES_PORT}/digital_twin"
export REDIS_URL="redis://localhost:${REDIS_PORT}"
export MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-digital-twin}"
export MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-digital-twin-secret}"
export MINIO_USE_SSL="${MINIO_USE_SSL:-false}"
export MINIO_BUCKET="${MINIO_BUCKET:-assets}"

info "[4/6] Starting PostgreSQL, Redis and MinIO..."
docker compose -p "$PROJECT_NAME" up -d --pull never

info "[5/6] Applying migrations and generating runtime files..."
pnpm install --frozen-lockfile
pnpm copy:three-decoders
pnpm --filter @digital-twin/api-server exec prisma migrate deploy
pnpm --filter @digital-twin/api-server exec prisma generate
pnpm --filter @digital-twin/asset-worker prisma:generate
resolve_tool_bins

info "[6/6] Starting API, worker, Socket and web apps..."
rm -f "$PID_DIR"/*.pid
export API_PUBLIC_BASE_URL="http://${LAN_IP}:3100/api"
export VITE_API_BASE_URL="http://${LAN_IP}:3100/api"

# API 用 LAN IP 生成 MinIO 预签名地址，浏览器从局域网访问时也能上传资源。
export MINIO_ENDPOINT="$LAN_IP"
start_process api "$ROOT/apps/api-server" api.log "$NODE_BIN" "$TSX_BIN" watch src/main.ts
export MINIO_ENDPOINT="localhost"
start_process worker "$ROOT/apps/asset-worker" worker.log "$NODE_BIN" "$TSX_BIN" watch src/main.ts
export SOCKET_HOST="0.0.0.0"
start_process socket "$ROOT/apps/socket-server" socket.log "$NODE_BIN" "$TSX_BIN" watch src/main.ts
start_process editor "$ROOT/apps/editor-web" editor.log "$NODE_BIN" "$VITE_BIN" --host 0.0.0.0 --port 5173 --strictPort
start_process runtime "$ROOT/apps/runtime-web" runtime.log "$NODE_BIN" "$VITE_BIN" --host 0.0.0.0 --port 5174 --strictPort

wait_for_services
print_urls
success "Project started successfully. Logs are in $ROOT/*.log."
