#!/usr/bin/env bash
# Updates a Git clone of DataForge to the latest version of its branch. Windows twin: update.ps1.
# A fast-forward pull, so conflicting local changes stop it untouched. Setup reruns only when
# runtimes or backend dependencies changed. Stop the app first.
#
# Usage: ./update.sh

set -eo pipefail

# shellcheck source=scripts/dev-common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/dev-common.sh"

# Changes to these are what setup.sh acts on and the launchers do not.
SETUP_INPUTS=(
    .python-version
    .node-version
    setup.sh
    backend/requirements.txt
    backend/requirements-dev.txt
    backend/requirements-tagging.txt
    scripts/setup_tagging.py
)
# Commits listed under the pull step before the rest are summarised.
SHOWN_COMMITS=10

fail() {
    # fail <message> [hint...]
    console_result fail "$@"
    exit 1
}

running_server() {
    # Prints "name PID port" for the first DataForge server from this folder, if any.
    local port pid
    for port in "$DEV_API_PORT" "$DEV_UI_PORT"; do
        for pid in $(port_listener_pids "$port" || true); do
            if process_is_ours "$pid"; then
                printf '%s (PID %s) on port %s\n' "$(process_name "$pid")" "$pid" "$port"
                return 0
            fi
        done
    done
    return 1
}

# The pull may rewrite this file, and bash reads a script as it runs. A function body is
# parsed whole before it runs, and main never returns to the rest of the file.
main() {
    local before after commits count setup_changes running setup_args reason

    console_title "DataForge update"

    command -v git >/dev/null 2>&1 \
        || fail "Git is required to update DataForge, and it is not on PATH."
    # A file, not a folder, in a linked worktree.
    [ -e "$DEV_ROOT/.git" ] || fail "This folder is not a Git clone, so there is nothing to pull." \
        "A ZIP download is updated by extracting a new copy; see \"Stop, restart, and update\"" \
        "in docs/getting-started.md. To update with ./update.sh from now on, clone with Git."

    if running="$(running_server)"; then
        fail "DataForge is still running: $running." \
            "Stop it first: press a key in its launcher terminal, or run ./stop.sh."
    fi

    before="$(git -C "$DEV_ROOT" rev-parse HEAD)" || fail "Could not read the current Git commit."

    # A credential prompt would hang unseen behind the captured output.
    console_start "Pull"
    GIT_TERMINAL_PROMPT=0 console_run git -C "$DEV_ROOT" pull --ff-only
    if [ "$CONSOLE_EXIT" != "0" ]; then
        console_done fail "exit $CONSOLE_EXIT"
        console_output "git pull --ff-only" "$CONSOLE_EXIT" "$CONSOLE_OUTPUT"
        fail "Git could not update this folder; nothing was changed." \
            "Local commits or edits to project files can block the update."
    fi

    after="$(git -C "$DEV_ROOT" rev-parse HEAD)"
    if [ "$after" = "$before" ]; then
        console_done ok "already up to date"
        console_result ok "DataForge is already up to date."
        exit 0
    fi

    commits="$(git -C "$DEV_ROOT" log --format='%h %s' --no-decorate "$before..$after")"
    count="$(printf '%s\n' "$commits" | wc -l | tr -d ' ')"
    console_done ok "$(console_count "$count" "new commit"), ${before:0:7} -> ${after:0:7}"
    while IFS= read -r line; do
        console_note "$line"
    done <<EOF
$(printf '%s\n' "$commits" | head -n "$SHOWN_COMMITS")
EOF
    if [ "$count" -gt "$SHOWN_COMMITS" ]; then
        console_note "$CONSOLE_GLYPH_MORE and $((count - SHOWN_COMMITS)) more"
    fi

    setup_changes="$(git -C "$DEV_ROOT" diff --name-only "$before" "$after" -- "${SETUP_INPUTS[@]}" | paste -sd ',' - | sed 's/,/, /g')"
    if [ -x "$DEV_VENV_PY" ] && [ -z "$setup_changes" ]; then
        console_step skip "Setup" "not needed: no runtime or backend dependency changes"
        console_result ok "Update complete." "Run ./start.sh to launch the app; it rebuilds the UI if that changed."
        exit 0
    fi

    setup_args=()
    if [ -x "$DEV_VENV_PY" ]; then
        reason="$setup_changes changed"
        if ! "$DEV_VENV_PY" -c 'import importlib.util, sys; sys.exit(importlib.util.find_spec("torch") is None)'; then
            setup_args=(--skip-tagging)
        fi
    else
        reason="no backend venv yet"
    fi
    console_step ok "Setup" "runs below: $reason"
    if [ "${#setup_args[@]}" -gt 0 ]; then
        console_note "The optional tagger stays left out, as before; ./setup.sh adds it."
    fi
    console_blank
    if ! bash "$DEV_ROOT/setup.sh" "${setup_args[@]}"; then
        fail "The code was updated, but setup failed." \
            "Fix the reported problem and run ./setup.sh before starting DataForge."
    fi
    exit 0
}

main "$@"
