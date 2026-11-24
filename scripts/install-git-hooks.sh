#!/usr/bin/env bash
# Installs the tracked git hooks for this repository. Twin: install-git-hooks.ps1.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/console.sh
. "$ROOT/scripts/console.sh"

console_title "DataForge git hooks"

if ! git config core.hooksPath .githooks; then
    console_step fail "Hooks" "git config core.hooksPath failed"
    exit 1
fi
console_step ok "Hooks" "installed from .githooks/"
console_note "pre-commit   auto-fixes lint and formatting, runs the lint-only checks, bumps the version"

MISSING=""
if [ ! -d backend/.venv ]; then
    MISSING="backend: backend/.venv/bin/pip install -r backend/requirements.txt -r backend/requirements-dev.txt"
fi
if [ ! -d frontend/node_modules ]; then
    MISSING="$MISSING
frontend: cd frontend && npm ci"
fi
if [ -n "$MISSING" ]; then
    console_step warn "Dependencies" "the hooks need these first; ./setup.sh installs both"
    while IFS= read -r line; do
        [ -n "$line" ] && console_note "$line"
    done <<EOF
$MISSING
EOF
else
    console_step ok "Dependencies" "backend/.venv and frontend/node_modules present"
fi
