#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
HOST="127.0.0.1"
START_PORT="${1:-${PORT:-5173}}"
VITE_ENTRY="$PROJECT_DIR/node_modules/vite/bin/vite.js"
VITE_PID=""
TUNNEL_PID=""
TEMP_DIR=""

log() {
  printf '[quick-tunnel] %s\n' "$*"
}

fail() {
  printf '[quick-tunnel] Error: %s\n' "$*" >&2
  exit 1
}

find_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return
  fi

  local candidates=(
    "/c/Program Files (x86)/cloudflared/cloudflared.exe"
    "/c/Program Files/cloudflared/cloudflared.exe"
    "/mnt/c/Program Files (x86)/cloudflared/cloudflared.exe"
    "/mnt/c/Program Files/cloudflared/cloudflared.exe"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  return 1
}

port_is_available() {
  node -e '
    const net = require("node:net");
    const port = Number(process.argv[1]);
    const host = process.argv[2];
    const server = net.createServer();
    server.unref();
    server.once("error", () => process.exit(1));
    server.listen(port, host, () => server.close(() => process.exit(0)));
  ' "$1" "$HOST"
}

find_available_port() {
  local port="$START_PORT"
  local last_port=$((START_PORT + 50))
  ((last_port <= 65535)) || last_port=65535
  while ((port <= last_port)); do
    if port_is_available "$port"; then
      printf '%s\n' "$port"
      return
    fi
    port=$((port + 1))
  done
  return 1
}

stop_process() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  kill "$pid" >/dev/null 2>&1 || return 0

  local attempt
  for attempt in {1..20}; do
    kill -0 "$pid" >/dev/null 2>&1 || return 0
    sleep 0.1
  done
  kill -9 "$pid" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  [[ -z "$TUNNEL_PID" && -z "$VITE_PID" ]] || log 'Stopping tunnel and local server...'
  stop_process "$TUNNEL_PID"
  stop_process "$VITE_PID"
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -f -- "$TEMP_DIR/vite.log" "$TEMP_DIR/cloudflared.log"
    rmdir -- "$TEMP_DIR" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

[[ "$START_PORT" =~ ^[0-9]+$ ]] || fail "Port must be a number: $START_PORT"
((START_PORT >= 1 && START_PORT <= 65535)) || fail "Port is outside the valid range: $START_PORT"
command -v node >/dev/null 2>&1 || fail 'Node.js is not installed or is not in PATH.'
command -v curl >/dev/null 2>&1 || fail 'curl is not installed or is not in PATH.'
[[ -f "$VITE_ENTRY" ]] || fail 'Vite is not installed. Run npm install first.'

CLOUDFLARED="$(find_cloudflared)" || fail 'cloudflared was not found. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
APP_PORT="$(find_available_port)" || fail "No available port was found from $START_PORT through 65535."
LOCAL_URL="http://$HOST:$APP_PORT"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bus-quick-tunnel.XXXXXX")"
VITE_LOG="$TEMP_DIR/vite.log"
TUNNEL_LOG="$TEMP_DIR/cloudflared.log"

log "Starting Vite at $LOCAL_URL ..."
(
  cd -- "$PROJECT_DIR"
  exec node "$VITE_ENTRY" --host "$HOST" --port "$APP_PORT" --strictPort
) >"$VITE_LOG" 2>&1 &
VITE_PID=$!

for _ in {1..60}; do
  if curl --silent --fail --max-time 1 "$LOCAL_URL/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$VITE_PID" >/dev/null 2>&1; then
    printf '\n' >&2
    cat "$VITE_LOG" >&2
    fail 'Vite stopped before it became ready.'
  fi
  sleep 0.25
done

curl --silent --fail --max-time 2 "$LOCAL_URL/" >/dev/null 2>&1 || {
  printf '\n' >&2
  cat "$VITE_LOG" >&2
  fail 'Vite did not become ready in time.'
}

log 'Requesting a Cloudflare Quick Tunnel...'
"$CLOUDFLARED" tunnel --url "$LOCAL_URL" --no-autoupdate --loglevel info >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in {1..120}; do
  PUBLIC_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
  [[ -z "$PUBLIC_URL" ]] || break
  if ! kill -0 "$TUNNEL_PID" >/dev/null 2>&1; then
    printf '\n' >&2
    cat "$TUNNEL_LOG" >&2
    fail 'cloudflared stopped before creating a tunnel.'
  fi
  sleep 0.25
done

if [[ -z "$PUBLIC_URL" ]]; then
  printf '\n' >&2
  cat "$TUNNEL_LOG" >&2
  fail 'Cloudflare did not return a Quick Tunnel URL in time.'
fi

for _ in {1..40}; do
  curl --silent --fail --max-time 3 "$PUBLIC_URL/" >/dev/null 2>&1 && break
  sleep 0.5
done

printf '\n'
printf 'Mobile HTTPS URL:\n\n  %s\n\n' "$PUBLIC_URL"
printf 'Local URL:\n\n  %s\n\n' "$LOCAL_URL"
printf 'Keep this terminal open. Press Ctrl+C to stop both services.\n\n'

while kill -0 "$VITE_PID" >/dev/null 2>&1 && kill -0 "$TUNNEL_PID" >/dev/null 2>&1; do
  sleep 1
done

if ! kill -0 "$VITE_PID" >/dev/null 2>&1; then
  printf '\nVite stopped unexpectedly:\n' >&2
  tail -n 30 "$VITE_LOG" >&2
else
  printf '\nCloudflare Tunnel stopped unexpectedly:\n' >&2
  tail -n 30 "$TUNNEL_LOG" >&2
fi

exit 1
