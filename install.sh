#!/usr/bin/env bash
# Claude Control installer — fully auto, no hardcoded paths or usernames.
# Detects this repo's location and the current user, builds both halves, and
# installs a systemd *user* service that serves the panel on 127.0.0.1.
#
#   ./install.sh                 # build + install + start the user service
#   PORT=9000 ./install.sh       # use a different port (default 8787)
#   ./install.sh --no-service    # just build; don't install the service
#
# Everything binds to loopback only. No root required for the default path;
# the optional Apache hostname proxy (printed at the end) is the only root step.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8787}"
WANT_SERVICE=1
[ "${1:-}" = "--no-service" ] && WANT_SERVICE=0

say() { printf '\033[1m› %s\033[0m\n' "$*"; }

# --- backend venv -----------------------------------------------------------
say "Python backend (.venv)"
[ -d "$APP_DIR/.venv" ] || python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/python" -m pip install --quiet --upgrade pip
"$APP_DIR/.venv/bin/python" -m pip install --quiet -r "$APP_DIR/backend/requirements.txt"

# --- frontend build ---------------------------------------------------------
say "Frontend build (dist)"
if ! command -v npm >/dev/null 2>&1; then
  echo "  ! npm not found — install Node.js 18+ then re-run." >&2; exit 1
fi
cd "$APP_DIR/frontend"
if [ -f package-lock.json ]; then npm ci --silent; else npm install --silent; fi
npm run build
cd "$APP_DIR"

if [ "$WANT_SERVICE" = 0 ]; then
  say "Built. Run it with:  ./run.sh build"
  exit 0
fi

# --- systemd user service ---------------------------------------------------
if ! command -v systemctl >/dev/null 2>&1; then
  say "systemd not found — skipping service. Start manually:  ./run.sh build"
  exit 0
fi
say "systemd user service (port $PORT)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$UNIT_DIR"
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__PORT__#$PORT#g" \
    "$APP_DIR/deploy/claude-control.service" > "$UNIT_DIR/claude-control.service"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user daemon-reload
systemctl --user enable claude-control.service >/dev/null 2>&1 || true
systemctl --user restart claude-control.service

sleep 1
if systemctl --user is-active --quiet claude-control.service; then
  say "Running → http://127.0.0.1:$PORT   (also http://claude.localhost:$PORT in Chrome)"
else
  echo "  ! service did not become active — check: systemctl --user status claude-control" >&2
fi

cat <<EOF

Optional — open it on a hostname without the port (needs root once):
  Apache:  sudo cp deploy/claude-control.apache.conf /etc/apache2/sites-available/claude-control.conf
           sudo a2ensite claude-control && sudo systemctl reload apache2
           → then browse http://claude-panel.localhost
  Or add one /etc/hosts line and use http://claude.local:$PORT
EOF
