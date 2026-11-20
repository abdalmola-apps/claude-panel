#!/usr/bin/env bash
# Claude Control launcher — sets up both halves and runs them on localhost.
#   ./run.sh         dev mode: FastAPI (:8787) + Vite dev server (:5174, HMR)
#   ./run.sh build   build the SPA and serve everything from FastAPI (:8787)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK="$ROOT/backend"
FRONT="$ROOT/frontend"
BACK_PORT=8787
FRONT_PORT=5174

# --- backend venv -----------------------------------------------------------
if [ ! -d "$ROOT/.venv" ]; then
  echo "› creating backend venv…"
  python3 -m venv "$ROOT/.venv"
fi
# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"
python -m pip install --quiet --upgrade pip >/dev/null
python -m pip install --quiet -r "$BACK/requirements.txt"

# --- frontend deps ----------------------------------------------------------
if [ ! -d "$FRONT/node_modules" ]; then
  echo "› installing frontend deps…"
  (cd "$FRONT" && npm install --silent)
fi

MODE="${1:-dev}"

if [ "$MODE" = "build" ]; then
  echo "› building SPA…"
  (cd "$FRONT" && npm run build)
  echo "› serving on http://127.0.0.1:$BACK_PORT"
  exec uvicorn app:app --app-dir "$BACK" --host 127.0.0.1 --port "$BACK_PORT"
fi

# --- dev mode ---------------------------------------------------------------
cleanup() { kill "${BACK_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "› backend  → http://127.0.0.1:$BACK_PORT"
uvicorn app:app --app-dir "$BACK" --host 127.0.0.1 --port "$BACK_PORT" --reload &
BACK_PID=$!

echo "› frontend → http://127.0.0.1:$FRONT_PORT  (open this one)"
(cd "$FRONT" && npm run dev -- --port "$FRONT_PORT" --strictPort)
