#!/usr/bin/env bash
# Launches the backend and frontend dev servers, waits for both, then supervises them.
# Logs are tagged [api] and [ui]; any key or Ctrl+C stops both. Windows twin: dev.ps1.
#
# Usage: ./dev.sh [--backend-only|--frontend-only] [--no-browser] [--no-reload] [--detach]

set -eo pipefail

# shellcheck source=scripts/dev-common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/dev-common.sh"

BACKEND_ONLY=0
FRONTEND_ONLY=0
NO_BROWSER=0
NO_RELOAD=0
DETACH=0

usage() {
    cat <<'USAGE'
Usage: ./dev.sh [options]

  --backend-only   Start only the API (DATAFORGE_API_PORT, default 18080)
  --frontend-only  Start only the Vite dev server (DATAFORGE_UI_PORT, default 18081)
  --no-browser     Do not open the browser once the servers are ready
  --no-reload      Run the API without uvicorn's reloader. Use this while a long
                   job is running: a reload re-runs job recovery and re-spawns
                   worker threads mid-flight
  --detach         Exit once both are ready instead of supervising them;
                   stop them later with ./stop.sh
  -h, --help       Show this help
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --backend-only) BACKEND_ONLY=1 ;;
        --frontend-only) FRONTEND_ONLY=1 ;;
        --no-browser) NO_BROWSER=1 ;;
        --no-reload) NO_RELOAD=1 ;;
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

if [ "$BACKEND_ONLY" = "1" ] && [ "$FRONTEND_ONLY" = "1" ]; then
    console_result fail "--backend-only and --frontend-only cannot be combined."
    exit 1
fi

START_BACKEND=1
START_FRONTEND=1
[ "$FRONTEND_ONLY" = "1" ] && START_BACKEND=0
[ "$BACKEND_ONLY" = "1" ] && START_FRONTEND=0
if [ "$NO_RELOAD" = "1" ]; then RELOAD_NOTE="no reload (--no-reload)"; else RELOAD_NOTE="uvicorn reloader"; fi

LEAVE_RUNNING=0

cleanup() {
    if [ "$LEAVE_RUNNING" = "0" ] && [ -n "$DEV_SUPERVISED" ]; then
        console_blank
        console_start "Stopping"
        stop_supervised
        # Backstop for a terminal closed by hand; it prints only problems.
        local freed=1
        if [ "$START_BACKEND" = "1" ]; then clear_port "$DEV_API_PORT" quiet || freed=0; fi
        if [ "$START_FRONTEND" = "1" ]; then clear_port "$DEV_UI_PORT" quiet || freed=0; fi
        if [ "$freed" = "1" ]; then
            console_done ok "both servers stopped"
        else
            console_done fail "a port is still in use; ./stop.sh retries"
        fi
    fi
}

trap 'exit 130' INT TERM
trap cleanup EXIT

TITLE_LINES=()
[ "$START_BACKEND" = "1" ] && TITLE_LINES[${#TITLE_LINES[@]}]="API  $DEV_API_URL  $RELOAD_NOTE"
[ "$START_FRONTEND" = "1" ] && TITLE_LINES[${#TITLE_LINES[@]}]="UI   $DEV_UI_URL  Vite HMR"
console_title "DataForge development" "${TITLE_LINES[@]}"

# Regenerating keeps the gitignored sources in step across branch switches.
if [ "$START_FRONTEND" = "1" ]; then
    update_generated_sources || true
fi

check_prerequisites "$START_BACKEND" "$START_FRONTEND" || exit 1
if [ "$START_FRONTEND" = "1" ]; then
    sync_frontend_dependencies || exit 1
fi
if [ "$START_BACKEND" = "1" ]; then check_backend_dependency_drift; fi

# Vite's strictPort makes a leftover node on the UI port fatal.
if [ "$START_BACKEND" = "1" ]; then
    clear_port "$DEV_API_PORT" || { console_result fail "The API port is taken."; exit 1; }
fi
if [ "$START_FRONTEND" = "1" ]; then
    clear_port "$DEV_UI_PORT" || { console_result fail "The UI port is taken."; exit 1; }
fi

BACKEND_PID=""
FRONTEND_PID=""

if [ "$START_BACKEND" = "1" ]; then
    if [ "$NO_RELOAD" = "1" ]; then
        start_server "api" "$DEV_ROOT" "$DEV_VENV_PY" "$DEV_DEV_SERVER" --no-reload
    else
        start_server "api" "$DEV_ROOT" "$DEV_VENV_PY" "$DEV_DEV_SERVER"
    fi
    BACKEND_PID="$DEV_LAST_PID"
    supervise "$BACKEND_PID"
fi

if [ "$START_FRONTEND" = "1" ]; then
    start_server "ui" "$DEV_FRONTEND" npm run dev
    FRONTEND_PID="$DEV_LAST_PID"
    supervise "$FRONTEND_PID"
fi

# Wait for real readiness, not a fixed sleep. The servers log to this terminal, so the
# running line stays off until the step result.
CONSOLE_LIVE_SAVED="$CONSOLE_LIVE"
CONSOLE_LIVE=0
FAILED=0

if [ "$START_BACKEND" = "1" ]; then
    console_start "API"
    if wait_http_ready "$DEV_HEALTH_URL" 60 "$BACKEND_PID"; then
        console_done ok "ready on port $DEV_API_PORT"
    else
        console_done fail "never answered /api/health; see the [api] log above"
        FAILED=1
    fi
fi

if [ "$START_FRONTEND" = "1" ]; then
    console_start "UI"
    if wait_tcp_ready "$DEV_UI_PORT" 90 "$FRONTEND_PID"; then
        console_done ok "ready on port $DEV_UI_PORT"
    else
        console_done fail "never accepted connections; see the [ui] log above"
        FAILED=1
    fi
fi
CONSOLE_LIVE="$CONSOLE_LIVE_SAVED"

if [ "$FAILED" = "1" ]; then
    LEAVE_RUNNING=1
    supervise_release
    console_result fail "The dev servers did not start." \
        "Whatever did start keeps running so the error stays readable; ./stop.sh frees the ports."
    exit 1
fi

if [ "$START_FRONTEND" = "1" ]; then APP_URL="$DEV_UI_URL"; else APP_URL="$DEV_API_URL"; fi
if [ "$NO_BROWSER" = "0" ]; then
    open_browser "$APP_URL"
fi

if [ "$DETACH" = "1" ]; then
    LEAVE_RUNNING=1
    supervise_release
    console_result ok "Running at $APP_URL." "The servers keep running in the background; ./stop.sh stops them."
    exit 0
fi

console_result ok "Running at $APP_URL."
console_hint "Press any key here to stop the servers, or Ctrl+C."
wait_for_key
