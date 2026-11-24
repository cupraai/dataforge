#!/usr/bin/env bash
# Production mode: builds the frontend if stale, then serves UI and API from one process.
# No reloader, so a long job is never restarted. Windows twin: start.ps1.
#
# Usage: ./start.sh [--rebuild] [--no-build] [--no-browser] [--detach]

set -eo pipefail

# shellcheck source=scripts/dev-common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/dev-common.sh"

REBUILD=0
NO_BUILD=0
NO_BROWSER=0
DETACH=0

usage() {
    cat <<'USAGE'
Usage: ./start.sh [options]

  --rebuild      Build the frontend even when dist looks up to date
  --no-build     Never build; serve whatever is already in frontend/dist
  --no-browser   Do not open the browser once the server is ready
  --detach       Exit once the server is ready instead of supervising it;
                 stop it later with ./stop.sh
  -h, --help     Show this help
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --rebuild) REBUILD=1 ;;
        --no-build) NO_BUILD=1 ;;
        --no-browser) NO_BROWSER=1 ;;
        --detach) DETACH=1 ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            console_result fail "Unknown option: $1"
            console_blank
            usage
            exit 1
            ;;
    esac
    shift
done

if [ "$REBUILD" = "1" ] && [ "$NO_BUILD" = "1" ]; then
    console_result fail "--rebuild and --no-build cannot be combined."
    exit 1
fi

LEAVE_RUNNING=0

cleanup() {
    if [ "$LEAVE_RUNNING" = "0" ] && [ -n "$DEV_SUPERVISED" ]; then
        console_blank
        console_start "Stopping"
        stop_supervised
        # Backstop for a terminal closed by hand; it prints only problems.
        if clear_port "$DEV_UI_PORT" quiet; then
            console_done ok "server stopped"
        else
            console_done fail "the port is still in use; ./stop.sh retries"
        fi
    fi
}

# The EXIT trap stops everything, so every way out takes one path.
trap 'exit 130' INT TERM
trap cleanup EXIT

console_title "DataForge" "$DEV_UI_URL  production build, no hot reload"

# Regenerated first, so a branch switch cannot leave a falsely fresh dist.
update_generated_sources || true

check_prerequisites 1 1 || exit 1
sync_frontend_dependencies || exit 1
check_backend_dependency_drift

if [ "$NO_BUILD" = "1" ]; then
    if [ ! -f "$DEV_DIST/index.html" ]; then
        console_step fail "Frontend build" "frontend/dist is empty"
        console_result fail "There is no frontend build to serve." "Run ./start.sh without --no-build."
        exit 1
    fi
    console_step skip "Frontend build" "serving the existing frontend/dist (--no-build)"
elif [ "$REBUILD" = "1" ]; then
    build_frontend "rebuilt (--rebuild)" || exit 1
elif ! dist_is_fresh; then
    build_frontend || exit 1
else
    console_step ok "Frontend build" "up to date"
fi

# A leftover ./dev.sh Vite holds this port too.
clear_port "$DEV_UI_PORT" || { console_result fail "The app port is taken."; exit 1; }

start_server "app" "$DEV_ROOT" "$DEV_VENV_PY" "$DEV_PROD_SERVER"
APP_PID="$DEV_LAST_PID"
supervise "$APP_PID"

# The server logs to this terminal, so the running line stays off until the step result.
CONSOLE_LIVE_SAVED="$CONSOLE_LIVE"
CONSOLE_LIVE=0
console_start "Server"
if wait_http_ready "$DEV_APP_HEALTH_URL" 60 "$APP_PID"; then
    console_done ok "ready on port $DEV_UI_PORT"
else
    console_done fail "never answered /api/health; see the [app] log above"
    LEAVE_RUNNING=1
    supervise_release
    console_result fail "DataForge did not start." "./stop.sh frees the port once you have read the log."
    exit 1
fi
CONSOLE_LIVE="$CONSOLE_LIVE_SAVED"

if [ "$NO_BROWSER" = "0" ]; then
    open_browser "$DEV_UI_URL"
fi

if [ "$DETACH" = "1" ]; then
    LEAVE_RUNNING=1
    supervise_release
    console_result ok "Running at $DEV_UI_URL." "The server keeps running in the background; ./stop.sh stops it."
    exit 0
fi

console_result ok "Running at $DEV_UI_URL."
console_hint "Press any key here to stop the server, or Ctrl+C."
wait_for_key
