# Shared helpers for the Unix launchers; source it: . "$(dirname "$0")/scripts/dev-common.sh"
# Mirrors scripts/dev-common.ps1 except for process supervision.
# Written for bash 3.2 (macOS): no associative arrays, no mapfile, no ${var,,}, no `set -u`.

# Resolved from this file's own location, so the launchers work from any cwd.
DEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_BACKEND="$DEV_ROOT/backend"
DEV_FRONTEND="$DEV_ROOT/frontend"
DEV_SCRIPTS="$DEV_ROOT/scripts"
DEV_DIST="$DEV_FRONTEND/dist"
DEV_VENV_PY="$DEV_BACKEND/.venv/bin/python"
DEV_DEV_SERVER="$DEV_SCRIPTS/dev_server.py"
DEV_PROD_SERVER="$DEV_SCRIPTS/prod_server.py"

# Generated and gitignored; the frontend neither starts nor builds without them.
DEV_GENERATED_SOURCES="types.ts constants.ts wireGuards.ts"

# Written only after a successful build; dist/index.html alone could be half-finished.
DEV_BUILD_STAMP_NAME=".dataforge-build-stamp"

# Written by setup.sh, and by setup.ps1, after a successful pip install.
DEV_DEPS_STAMP="$DEV_BACKEND/.venv/.dataforge-deps-stamp"

# shellcheck source=scripts/console.sh
. "$DEV_SCRIPTS/console.sh"

# ---------------------------------------------------------------------------
# .env, mirroring backend/env_file.py
# ---------------------------------------------------------------------------

# Same candidate order as env_file.py, first file wins; real environment variables override.
DEV_ENV_FILE=""
for _dev_candidate in "$DEV_ROOT/.env" "$DEV_BACKEND/.env"; do
    if [ -f "$_dev_candidate" ]; then
        DEV_ENV_FILE="$_dev_candidate"
        break
    fi
done
unset _dev_candidate

dev_env_value() {
    # Prints the value for a key from DEV_ENV_FILE, or nothing when it is absent.
    local key="$1"
    local line text name value first last

    [ -n "$DEV_ENV_FILE" ] || return 1
    [ -f "$DEV_ENV_FILE" ] || return 1

    while IFS= read -r line || [ -n "$line" ]; do
        text="${line#"${line%%[![:space:]]*}"}"
        text="${text%"${text##*[![:space:]]}"}"
        case "$text" in
            "" | "#"*) continue ;;
        esac
        case "$text" in
            "export "*) text="${text#export }" ;;
        esac
        case "$text" in
            *=*) : ;;
            *) continue ;;
        esac

        name="${text%%=*}"
        name="${name%"${name##*[![:space:]]}"}"
        [ "$name" = "$key" ] || continue

        value="${text#*=}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"

        # Strip one layer of matching quotes, the way python-dotenv does.
        if [ ${#value} -ge 2 ]; then
            first="${value%"${value#?}"}"
            last="${value#"${value%?}"}"
            if [ "$first" = "$last" ]; then
                case "$first" in
                    '"' | "'")
                        value="${value#?}"
                        value="${value%?}"
                        ;;
                esac
            fi
        fi

        printf '%s\n' "$value"
        return 0
    done < "$DEV_ENV_FILE"

    return 1
}

dev_port() {
    # A real environment variable beats .env; an explicitly blank one still wins, as in dev_server.py.
    local name="$1" default="$2" raw

    if [ -n "${!name+set}" ]; then
        raw="${!name}"
    else
        raw="$(dev_env_value "$name" 2>/dev/null || true)"
    fi

    raw="${raw#"${raw%%[![:space:]]*}"}"
    raw="${raw%"${raw##*[![:space:]]}"}"

    if [ -z "$raw" ]; then
        printf '%s\n' "$default"
        return 0
    fi

    case "$raw" in
        *[!0-9]*)
            console_warning "Ignoring $name=$raw: not a port number. Using $default."
            printf '%s\n' "$default"
            return 0
            ;;
    esac

    if [ "$raw" -lt 1 ] || [ "$raw" -gt 65535 ]; then
        console_warning "Ignoring $name=$raw: not a port number. Using $default."
        printf '%s\n' "$default"
        return 0
    fi

    printf '%s\n' "$raw"
}

# vite.config.ts and server_settings.py resolve the same two variables.
DEV_API_PORT="$(dev_port DATAFORGE_API_PORT 18080)"
DEV_UI_PORT="$(dev_port DATAFORGE_UI_PORT 18081)"
DEV_API_URL="http://127.0.0.1:$DEV_API_PORT"
DEV_UI_URL="http://127.0.0.1:$DEV_UI_PORT"
DEV_HEALTH_URL="$DEV_API_URL/api/health"
# Production serves both halves on the UI port, so its health check lives there.
DEV_APP_HEALTH_URL="$DEV_UI_URL/api/health"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

update_generated_sources() {
    # Always regenerates: gitignored files survive a branch switch with a plausible mtime.
    # A missing or broken venv is reported by check_prerequisites instead.
    [ -x "$DEV_VENV_PY" ] || return 0
    "$DEV_VENV_PY" -c pass >/dev/null 2>&1 || return 0

    # Only changed files are rewritten, so dist freshness is unaffected.
    console_start "API types"
    console_run "$DEV_VENV_PY" "$DEV_SCRIPTS/generate_types.py"
    if [ "$CONSOLE_EXIT" != "0" ]; then
        console_done warn "left as they were; the UI may not match the API"
        console_output "python scripts/generate_types.py" "$CONSOLE_EXIT" "$CONSOLE_OUTPUT"
        return 1
    fi
    console_done ok "$(generated_detail "$CONSOLE_OUTPUT")"
}

generated_detail() {
    # generated_detail <output file>
    local written
    written="$(grep -c '^Wrote ' "$1" || true)"
    if [ "${written:-0}" = "0" ]; then
        printf 'up to date'
    else
        printf '%s updated' "$(console_count "$written" file)"
    fi
}

npm_detail() {
    # npm_detail <output file>
    local added
    added="$(sed -n 's/.*added \([0-9][0-9]*\) package.*/\1/p' "$1" | head -n 1)"
    if [ -n "$added" ]; then console_count "$added" package; else printf 'up to date'; fi
}

check_prerequisites() {
    # check_prerequisites <check_backend 0|1> <check_frontend 0|1>
    local check_backend="$1" check_frontend="$2"
    local name missing status

    status=0

    if [ "$check_backend" = "1" ] && [ ! -x "$DEV_VENV_PY" ]; then
        console_step fail "Backend venv" "not found at backend/.venv"
        status=1
    elif [ "$check_backend" = "1" ] && ! "$DEV_VENV_PY" -c pass >/dev/null 2>&1; then
        # A moved folder or a removed base Python leaves a venv that no longer starts.
        console_step fail "Backend venv" "does not start; was the folder moved?"
        status=1
    fi

    if [ "$check_frontend" = "1" ]; then
        if [ ! -d "$DEV_FRONTEND/node_modules" ]; then
            console_step fail "Frontend packages" "not installed (cd frontend && npm ci)"
            status=1
        fi

        missing=""
        for name in $DEV_GENERATED_SOURCES; do
            if [ ! -f "$DEV_FRONTEND/src/shared/$name" ]; then
                missing="${missing:+$missing, }$name"
            fi
        done
        if [ -n "$missing" ]; then
            console_step fail "API types" "missing $missing"
            status=1
        fi
    fi

    if [ "$status" != "0" ]; then
        console_result fail "DataForge needs setup first." \
            "Run ./setup.sh from the project root, then try again."
    fi
    return "$status"
}

sync_frontend_dependencies() {
    local lock="$DEV_FRONTEND/package-lock.json" installed="$DEV_FRONTEND/node_modules/.package-lock.json"

    [ -f "$lock" ] || return 0
    if [ -f "$installed" ] && [ ! "$lock" -nt "$installed" ]; then
        return 0
    fi

    if ! console_run_step "Frontend packages" "The frontend packages could not be installed." \
        -C "$DEV_FRONTEND" npm ci; then
        console_result fail "$CONSOLE_FAILURE"
        return 1
    fi
    console_done ok "$(npm_detail "$CONSOLE_OUTPUT"), package-lock.json changed"
}

check_backend_dependency_drift() {
    # Warns when a pull brought in uninstalled backend dependencies; advisory only.
    # No frontend arm: sync_frontend_dependencies already reinstalled from the lockfile.
    local name req stale=0

    if [ -f "$DEV_DEPS_STAMP" ]; then
        for name in requirements.txt requirements-dev.txt requirements-tagging.txt; do
            req="$DEV_BACKEND/$name"
            if [ -f "$req" ] && [ "$req" -nt "$DEV_DEPS_STAMP" ]; then
                console_step warn "Backend packages" "backend/$name changed since the last install"
                stale=1
            fi
        done
    fi
    if [ "$stale" = "1" ]; then
        console_note "Run ./setup.sh if the API fails to import something."
    fi

    return 0
}

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------

dist_is_fresh() {
    # Whether frontend/dist is newer than every source; find -newer works on BSD and GNU alike.
    local stamp="$DEV_DIST/$DEV_BUILD_STAMP_NAME"
    local inputs name found

    [ -f "$stamp" ] || return 1
    [ -f "$DEV_DIST/index.html" ] || return 1

    # Everything vite build reads, generated src/shared files included.
    inputs=()
    for name in src public index.html package.json package-lock.json vite.config.ts; do
        if [ -e "$DEV_FRONTEND/$name" ]; then
            inputs[${#inputs[@]}]="$DEV_FRONTEND/$name"
        fi
    done
    for name in "$DEV_FRONTEND"/tsconfig*.json; do
        if [ -e "$name" ]; then
            inputs[${#inputs[@]}]="$name"
        fi
    done

    # Nothing to compare against - treat the build as fresh, as the twin does.
    [ "${#inputs[@]}" -gt 0 ] || return 0

    found="$(find "${inputs[@]}" -newer "$stamp" -print 2>/dev/null | head -n 1)"
    [ -z "$found" ]
}

build_frontend() {
    # build_frontend [detail]: captured; a failure prints the compiler errors.
    if ! console_run_step "Frontend build" \
        "The frontend build failed. Fix the errors above and try again." \
        -C "$DEV_FRONTEND" npm run build; then
        console_result fail "$CONSOLE_FAILURE"
        return 1
    fi
    date +%Y-%m-%dT%H:%M:%S%z > "$DEV_DIST/$DEV_BUILD_STAMP_NAME"
    console_done ok "${1:-sources changed}"
    return 0
}

# ---------------------------------------------------------------------------
# Ports
# ---------------------------------------------------------------------------

port_listener_pids() {
    # PIDs listening on a port; exit 2 means neither tool is present.
    local port="$1"

    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u
        return 0
    fi

    if command -v ss >/dev/null 2>&1; then
        ss -lptnH "sport = :$port" 2>/dev/null |
            grep -o 'pid=[0-9][0-9]*' | cut -d= -f2 | sort -u
        return 0
    fi

    return 2
}

process_name() {
    ps -o comm= -p "$1" 2>/dev/null | sed 's|.*/||' | tr -d ' '
}

process_is_ours() {
    # Whether a PID is a DataForge server from this folder: its command line names a path
    # inside the project root (the venv python, scripts/, or frontend/node_modules).
    # Another project's server, or another DataForge checkout, does not match.
    case "$(ps -o args= -p "$1" 2>/dev/null)" in
        *"$DEV_ROOT/"*) return 0 ;;
    esac
    return 1
}

clear_port() {
    # clear_port <port> [quiet|report-free]: frees a dev port held by a leftover DataForge
    # server from this folder; returns 0 when free. Anything else is named and left alone.
    # quiet reports only problems; report-free also reports a port that was already free.
    local port="$1" mode="$2" label="Port $1"
    local pids pid name pgid deadline foreign stopped rc

    rc=0
    pids="$(port_listener_pids "$port")" || rc=$?
    if [ "$rc" -eq 2 ]; then
        console_step warn "$label" "not checked: neither lsof nor ss is available"
        return 0
    fi
    if [ -z "$pids" ]; then
        [ "$mode" != "report-free" ] || console_step ok "$label" "free"
        return 0
    fi

    foreign=""
    stopped=""
    for pid in $pids; do
        name="$(process_name "$pid")"
        if process_is_ours "$pid"; then
            stopped="${stopped:+$stopped, }$name (PID $pid)"
        else
            foreign="${foreign:+$foreign, }${name:-unknown} (PID $pid)"
        fi
    done
    if [ -n "$foreign" ]; then
        console_step fail "$label" "held by $foreign"
        console_note "Not a DataForge server from this folder, so it was left running."
        console_note "Stop it, or set DATAFORGE_API_PORT / DATAFORGE_UI_PORT in .env, and try again."
        return 1
    fi

    [ "$mode" = "quiet" ] || console_start "$label"
    for pid in $pids; do
        # Kill the tree: python -> uvicorn reload child, npm -> node.
        pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
        if [ -n "$pgid" ]; then
            kill -TERM "-$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
        else
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done

    # Lazily released sockets are as fatal as occupied ones under Vite's strictPort.
    deadline=$(( $(date +%s) + 5 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        pids="$(port_listener_pids "$port")" || true
        if [ -z "$pids" ]; then
            [ "$mode" = "quiet" ] || console_done ok "stopped leftover $stopped"
            return 0
        fi
        sleep 0.2
    done

    for pid in $pids; do
        kill -KILL "$pid" 2>/dev/null || true
    done
    sleep 0.5

    pids="$(port_listener_pids "$port")" || true
    if [ -n "$pids" ]; then
        if [ "$mode" = "quiet" ]; then
            # The caller's own step stays open; it reports the overall outcome.
            console_step fail "$label" "still in use after stopping $stopped"
        else
            console_done fail "still in use after stopping $stopped"
        fi
        return 1
    fi
    [ "$mode" = "quiet" ] || console_done ok "stopped leftover $stopped"
    return 0
}

# ---------------------------------------------------------------------------
# Readiness
# ---------------------------------------------------------------------------

wait_http_ready() {
    # Returns non-zero on timeout, or as soon as the watched process exits.
    local url="$1" timeout="$2" watch_pid="$3"
    local deadline

    [ -n "$timeout" ] || timeout=40

    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        console_note "Neither curl nor wget is available, so readiness was not checked."
        return 0
    fi

    deadline=$(( $(date +%s) + timeout ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        if [ -n "$watch_pid" ] && ! kill -0 "$watch_pid" 2>/dev/null; then
            return 1
        fi
        console_update "waiting for /${url#http://*/}"
        if command -v curl >/dev/null 2>&1; then
            if curl -fsS -o /dev/null -m 2 "$url" 2>/dev/null; then
                return 0
            fi
        elif wget -q -O /dev/null -T 2 "$url" 2>/dev/null; then
            return 0
        fi
        sleep 0.4
    done

    return 1
}

wait_tcp_ready() {
    # For Vite, which has no health endpoint.
    local port="$1" timeout="$2" watch_pid="$3"
    local host="127.0.0.1" deadline

    [ -n "$timeout" ] || timeout=60

    deadline=$(( $(date +%s) + timeout ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        if [ -n "$watch_pid" ] && ! kill -0 "$watch_pid" 2>/dev/null; then
            return 1
        fi
        console_update "waiting for port $port"
        if command -v nc >/dev/null 2>&1; then
            if nc -z "$host" "$port" >/dev/null 2>&1; then
                return 0
            fi
        elif (exec 3<>"/dev/tcp/$host/$port") >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.3
    done

    return 1
}

# ---------------------------------------------------------------------------
# Supervision
# ---------------------------------------------------------------------------
#
# Unlike Windows, servers are background children in their own process groups,
# and one shell trap covers Ctrl+C, kill and a closed terminal.

DEV_SUPERVISED=""
DEV_LAST_PID=""

start_server() {
    # start_server <label> <workdir> <command...>
    # Sets DEV_LAST_PID to the job, which under job control is also its group id.
    local label="$1" workdir="$2"
    shift 2

    # Its own process group, so killing the group reaps uvicorn's reload child.
    set -m
    (
        cd "$workdir" || exit 1
        # Unbuffered, or a piped server looks hung; the tag keeps interleaved logs readable.
        PYTHONUNBUFFERED=1 "$@" 2>&1 |
            awk -v tag="${CONSOLE_DIM}[$label]${CONSOLE_RESET} " '{ print tag $0; fflush() }'
    ) &
    DEV_LAST_PID=$!
    set +m
}

supervise() {
    DEV_SUPERVISED="$DEV_SUPERVISED $1"
}

supervise_release() {
    # For --detach and readiness failures that keep the error on screen.
    DEV_SUPERVISED=""
}

stop_process_group() {
    local pgid="$1" deadline

    [ -n "$pgid" ] || return 0
    kill -TERM "-$pgid" 2>/dev/null || return 0

    deadline=$(( $(date +%s) + 5 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        kill -0 "-$pgid" 2>/dev/null || return 0
        sleep 0.2
    done

    kill -KILL "-$pgid" 2>/dev/null || true
}

stop_supervised() {
    local pgid
    for pgid in $DEV_SUPERVISED; do
        stop_process_group "$pgid"
    done
    DEV_SUPERVISED=""
}

open_browser() {
    local url="$1"
    if command -v open >/dev/null 2>&1; then
        open "$url" >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 || true
    fi
}

wait_for_key() {
    # Returns on a key press; without a terminal it blocks and leaves stopping to the trap.
    local unused
    if [ -t 0 ]; then
        # A builtin, so a trapped signal runs its handler at once.
        read -r -n 1 -s unused 2>/dev/null || read -r unused || true
    else
        # `sleep &` plus `wait`: bash defers a trap until a foreground external command ends.
        while :; do
            sleep 3600 &
            wait $! || true
        done
    fi
}
