#!/usr/bin/env bash
# Installs the backend venv, the frontend packages and the generated API types, using the
# Python and Node on this machine. Windows twin: setup.ps1.
#
# Usage: ./setup.sh [--skip-tagging]

set -eo pipefail

# shellcheck source=scripts/dev-common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/dev-common.sh"

PYTHON_VERSION="$(tr -d '\r\n' < "$DEV_ROOT/.python-version")"
PYTHON_SERIES="${PYTHON_VERSION%.*}"

NODE_VERSION_PIN="$(tr -d '\r\n' < "$DEV_ROOT/.node-version")"
NODE_MAJOR="${NODE_VERSION_PIN%%.*}"
NODE_RANGE="$NODE_MAJOR.x"

SKIP_TAGGING=0
for arg in "$@"; do
    case "$arg" in
        --skip-tagging) SKIP_TAGGING=1 ;;
        *)
            console_result fail "Unknown option: $arg" "Supported: --skip-tagging"
            exit 1
            ;;
    esac
done

python_matches_pin() {
    "$1" "$DEV_SCRIPTS/py_version.py" >/dev/null 2>&1
}

find_python() {
    local candidate
    if [ -n "$DATAFORGE_PYTHON" ]; then
        if python_matches_pin "$DATAFORGE_PYTHON"; then
            printf '%s\n' "$DATAFORGE_PYTHON"
            return 0
        fi
        return 1
    fi
    for candidate in "python$PYTHON_SERIES" python3 python; do
        if command -v "$candidate" >/dev/null 2>&1 && python_matches_pin "$candidate"; then
            command -v "$candidate"
            return 0
        fi
    done
    return 1
}

node_version_ok() {
    [[ "${1#v}" =~ ^"${NODE_MAJOR}"\.[0-9]+\.[0-9]+$ ]]
}

SETUP_STARTED="$(date +%s)"

fail() {
    # fail <message> [hint...]
    local message="$1"
    shift
    console_result fail "Setup failed: $message" "$@"
    exit 1
}

pip_detail() {
    local installed
    installed="$(sed -n 's/^Successfully installed //p' "$1" | tail -n 1)"
    if [ -z "$installed" ]; then
        printf 'up to date'
    else
        # shellcheck disable=SC2086
        printf '%s installed' "$(console_count "$(set -- $installed; echo $#)" package)"
    fi
}

console_title "DataForge setup" "Python $PYTHON_SERIES.x and Node $NODE_RANGE from this machine"

# ---------------------------------------------------------------------------
# 1. Interpreters
# ---------------------------------------------------------------------------

PYTHON="$(find_python || true)"
if [ -z "$PYTHON" ]; then
    found=""
    if command -v python3 >/dev/null 2>&1; then
        found=", found $(python3 -V 2>&1 | tr -d '\n')"
    fi
    console_step fail "Python" "no Python $PYTHON_SERIES.x$found"
    fail "No Python $PYTHON_SERIES.x was found." \
        "Install any final Python $PYTHON_SERIES.x release, for example with pyenv:" \
        "  pyenv install $PYTHON_VERSION && pyenv local $PYTHON_VERSION" \
        "Already have one elsewhere? DATAFORGE_PYTHON=/path/to/python3.13 ./setup.sh"
fi
console_step ok "Python" "$("$PYTHON" -V 2>&1 | tr -d '\n') at $PYTHON"

if ! command -v node >/dev/null 2>&1; then
    console_step fail "Node.js" "not on PATH"
    fail "Node is not installed, or not on PATH. DataForge needs $NODE_RANGE."
fi
NODE_VERSION="$(node --version)"
if ! node_version_ok "$NODE_VERSION"; then
    console_step fail "Node.js" "$NODE_VERSION is outside $NODE_RANGE"
    fail "The frontend supports Node $NODE_RANGE only; npm would refuse the install." \
        "Install Node $NODE_VERSION_PIN (pinned in .node-version), or any $NODE_RANGE release."
fi
if ! command -v npm >/dev/null 2>&1; then
    console_step fail "Node.js" "$NODE_VERSION, but npm is not on PATH"
    fail "npm is not installed, or not on PATH."
fi
console_step ok "Node.js" "$NODE_VERSION at $(command -v node)"

# ---------------------------------------------------------------------------
# 2. Backend
# ---------------------------------------------------------------------------

console_start "Backend venv"
if [ ! -x "$DEV_VENV_PY" ]; then
    console_run "$PYTHON" -m venv "$DEV_BACKEND/.venv"
    if [ "$CONSOLE_EXIT" != "0" ]; then
        console_done fail "exit $CONSOLE_EXIT"
        console_output "python -m venv backend/.venv" "$CONSOLE_EXIT" "$CONSOLE_OUTPUT"
        fail "Failed to create backend/.venv." \
            "On Debian and Ubuntu the venv module ships separately: sudo apt install python3.13-venv"
    fi
    [ -x "$DEV_VENV_PY" ] || fail "backend/.venv was created but has no bin/python."
    VENV_DETAIL="created backend/.venv"
elif ! python_matches_pin "$DEV_VENV_PY"; then
    console_run "$PYTHON" -m venv --clear "$DEV_BACKEND/.venv"
    if [ "$CONSOLE_EXIT" != "0" ]; then
        console_done fail "exit $CONSOLE_EXIT"
        console_output "python -m venv --clear backend/.venv" "$CONSOLE_EXIT" "$CONSOLE_OUTPUT"
        fail "Failed to recreate backend/.venv."
    fi
    VENV_DETAIL="recreated backend/.venv for Python $PYTHON_SERIES.x"
else
    VENV_DETAIL="reused backend/.venv"
fi
"$DEV_VENV_PY" "$DEV_SCRIPTS/py_version.py" >/dev/null 2>&1 \
    || fail "backend/.venv must use Python $PYTHON_SERIES.x."
console_done ok "$VENV_DETAIL"

console_run_step "pip" "pip upgrade failed." \
    "$DEV_VENV_PY" -m pip install --upgrade pip || fail "$CONSOLE_FAILURE"
PIP_VERSION="$(sed -n 's/^Successfully installed pip-//p' "$CONSOLE_OUTPUT")"
if [ -n "$PIP_VERSION" ]; then console_done ok "upgraded to $PIP_VERSION"; else console_done ok "up to date"; fi

console_run_step "Backend packages" "Backend dependency installation failed." \
    "$DEV_VENV_PY" -m pip install \
    -r "$DEV_BACKEND/requirements.txt" \
    -r "$DEV_BACKEND/requirements-dev.txt" || fail "$CONSOLE_FAILURE"
console_done ok "$(pip_detail "$CONSOLE_OUTPUT")"

console_run_step "FFmpeg check" \
    "FFmpeg 7.1.x is required. Install a matching binary on PATH and run setup again." \
    "$DEV_VENV_PY" "$DEV_SCRIPTS/check_ffmpeg.py" || fail "$CONSOLE_FAILURE"
FFMPEG_VERSION="$(sed -n 's/^ffmpeg version n\{0,1\}\([0-9][0-9.]*\).*/\1/p' "$CONSOLE_OUTPUT")"
console_done ok "$FFMPEG_VERSION at $(head -n 1 "$CONSOLE_OUTPUT")"

# Optional: a failure only warns, since everything else works without the tagger.
if [ "$SKIP_TAGGING" = "1" ]; then
    console_step skip "Tagging" "left out (--skip-tagging)"
else
    console_start "Tagging"
    console_run "$DEV_VENV_PY" "$DEV_SCRIPTS/setup_tagging.py"
    if [ "$CONSOLE_EXIT" = "0" ]; then
        console_done ok "$(grep -v '^[[:space:]]*$' "$CONSOLE_OUTPUT" | tail -n 1)"
    else
        console_done warn "could not be set up; everything else works. Run ./setup.sh to retry."
        console_output "python scripts/setup_tagging.py" "$CONSOLE_EXIT" "$CONSOLE_OUTPUT"
    fi
fi

# Dates the install for check_backend_dependency_drift; shared with the PowerShell side.
date +%Y-%m-%dT%H:%M:%S%z > "$DEV_DEPS_STAMP"

# ---------------------------------------------------------------------------
# 3. Frontend
# ---------------------------------------------------------------------------

# npm ci installs the locked tree; npm install only when there is no lockfile yet.
if [ -f "$DEV_FRONTEND/package-lock.json" ]; then NPM_VERB=ci; else NPM_VERB=install; fi
console_run_step "Frontend packages" "Frontend npm $NPM_VERB failed." \
    -C "$DEV_FRONTEND" npm "$NPM_VERB" || fail "$CONSOLE_FAILURE"
console_done ok "$(npm_detail "$CONSOLE_OUTPUT")"

# ---------------------------------------------------------------------------
# 4. Generated sources
# ---------------------------------------------------------------------------

# Gitignored, generated from the venv: the frontend cannot build until this has run.
console_run_step "API types" "Frontend type generation failed." \
    "$DEV_VENV_PY" "$DEV_SCRIPTS/generate_types.py" || fail "$CONSOLE_FAILURE"
console_done ok "$(generated_detail "$CONSOLE_OUTPUT")"

console_result ok "Setup complete in $(console_duration $(($(date +%s) - SETUP_STARTED)))." \
    "./start.sh   runs the app at $DEV_UI_URL" \
    "./dev.sh     develops it, with hot reload" \
    "Working on DataForge itself? Install the hooks too: bash scripts/install-git-hooks.sh"
