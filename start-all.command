#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
cd "$ROOT"
exec "$ROOT/scripts/start-all.sh" "$@"
