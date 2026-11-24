# Console output shared by every bash script; source it. Twin: scripts/console.ps1.
# Written for bash 3.2 (macOS): no associative arrays, no mapfile, no ${var,,}, no `set -u`.
#
# Every script prints the shape scripts/run_checks.py set:
#
#   DataForge setup                      console_title, once
#     Python 3.13 and Node 26            dim context lines
#
#     ✓ Backend packages    42s  ...     one line per step, "·" live while it runs
#         note                           console_note, listed under its step
#
#   Setup complete in 1m 03s.            console_result, once
#
# Child processes run captured (console_run), and their output shows only on failure.
# Durations are whole seconds: bash 3.2 and BSD date have no sub-second clock.

if [ -t 1 ] && [ "${TERM:-}" != "dumb" ]; then CONSOLE_LIVE=1; else CONSOLE_LIVE=0; fi
if [ "$CONSOLE_LIVE" = "1" ] && [ -z "${NO_COLOR:-}" ]; then
    CONSOLE_BOLD=$'\033[1m'
    CONSOLE_DIM=$'\033[2m'
    CONSOLE_RED=$'\033[31m'
    CONSOLE_GREEN=$'\033[32m'
    CONSOLE_YELLOW=$'\033[33m'
    CONSOLE_CYAN=$'\033[36m'
    CONSOLE_RESET=$'\033[0m'
else
    CONSOLE_BOLD=""
    CONSOLE_DIM=""
    CONSOLE_RED=""
    CONSOLE_GREEN=""
    CONSOLE_YELLOW=""
    CONSOLE_CYAN=""
    CONSOLE_RESET=""
fi
case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *UTF-8* | *utf-8* | *UTF8* | *utf8*)
        CONSOLE_GLYPH_OK="✓" CONSOLE_GLYPH_FAIL="✗" CONSOLE_GLYPH_RUN="·" CONSOLE_GLYPH_MORE="…"
        ;;
    *)
        CONSOLE_GLYPH_OK="+" CONSOLE_GLYPH_FAIL="x" CONSOLE_GLYPH_RUN=">" CONSOLE_GLYPH_MORE="..."
        ;;
esac
CONSOLE_GLYPH_WARN="!"
CONSOLE_GLYPH_SKIP="-"

CONSOLE_LABEL_WIDTH=18
# A failure dump keeps the end, where pip, npm and git put the actual error.
CONSOLE_DUMP_LINES=60
CONSOLE_PENDING=0
CONSOLE_AFTER_BLANK=1
CONSOLE_STEP=""
CONSOLE_STEP_STARTED=0
CONSOLE_NOTES=""
# Set by console_run: the exit status and a file holding the combined output.
CONSOLE_EXIT=0
CONSOLE_OUTPUT=""

_console_clear() {
    if [ "$CONSOLE_PENDING" = "1" ]; then
        printf '\r\033[K'
        CONSOLE_PENDING=0
    fi
}

_console_line() {
    # _console_line <text with escapes already applied>
    _console_clear
    printf '%s\n' "$1"
    CONSOLE_AFTER_BLANK=0
}

console_blank() {
    _console_clear
    [ "$CONSOLE_AFTER_BLANK" = "1" ] || printf '\n'
    CONSOLE_AFTER_BLANK=1
}

console_duration() {
    # console_duration <seconds>
    if [ "$1" -lt 60 ]; then
        printf '%ss' "$1"
    else
        printf '%sm %02ds' "$(($1 / 60))" "$(($1 % 60))"
    fi
}

console_count() {
    # console_count <n> <noun>
    if [ "$1" = "1" ]; then printf '1 %s' "$2"; else printf '%s %ss' "$1" "$2"; fi
}

console_title() {
    # console_title <title> [context line...]
    local line
    _console_line "${CONSOLE_BOLD}$1${CONSOLE_RESET}"
    shift
    for line in "$@"; do
        _console_line "  ${CONSOLE_DIM}${line}${CONSOLE_RESET}"
    done
    console_blank
}

console_step() {
    # console_step <ok|fail|warn|skip> <label> [detail] [seconds]
    # Without seconds the duration column stays blank, so details line up either way.
    local status="$1" label="$2" detail="$3" seconds="$4"
    local glyph color detail_color duration="" padded
    case "$status" in
        ok) glyph="$CONSOLE_GLYPH_OK" color="$CONSOLE_GREEN" detail_color="$CONSOLE_DIM" ;;
        fail) glyph="$CONSOLE_GLYPH_FAIL" color="$CONSOLE_RED" detail_color="$CONSOLE_RED" ;;
        warn) glyph="$CONSOLE_GLYPH_WARN" color="$CONSOLE_YELLOW" detail_color="$CONSOLE_YELLOW" ;;
        *) glyph="$CONSOLE_GLYPH_SKIP" color="$CONSOLE_DIM" detail_color="$CONSOLE_DIM" ;;
    esac
    if [ -n "$seconds" ] && [ "$seconds" -ge 1 ]; then
        duration="$(console_duration "$seconds")"
    fi
    if [ -z "$detail" ] && [ -z "$duration" ]; then
        _console_line "  ${color}${glyph}${CONSOLE_RESET} $label"
        return 0
    fi
    padded="$(printf "%-${CONSOLE_LABEL_WIDTH}s  ${CONSOLE_DIM}%6s${CONSOLE_RESET}" "$label" "$duration")"
    [ "$status" = "skip" ] && padded="${CONSOLE_DIM}${padded}${CONSOLE_RESET}"
    if [ -n "$detail" ]; then
        padded="$padded  ${detail_color}${detail}${CONSOLE_RESET}"
    fi
    _console_line "  ${color}${glyph}${CONSOLE_RESET} $padded"
}

console_note() {
    # console_note <text>: under the running step once it finishes, or now outside one.
    if [ -n "$CONSOLE_STEP" ]; then
        CONSOLE_NOTES="$CONSOLE_NOTES$1
"
    else
        _console_line "      ${CONSOLE_DIM}$1${CONSOLE_RESET}"
    fi
}

console_start() {
    # console_start <label>: a timed step, shown as running until console_done.
    [ -z "$CONSOLE_STEP" ] || console_done
    CONSOLE_STEP="$1"
    CONSOLE_STEP_STARTED="$(date +%s)"
    CONSOLE_NOTES=""
    console_update
}

console_update() {
    # console_update [activity]: redraws the running line with elapsed time and activity.
    local text elapsed width
    [ "$CONSOLE_LIVE" = "1" ] && [ -n "$CONSOLE_STEP" ] || return 0
    text="  $CONSOLE_GLYPH_RUN $CONSOLE_STEP..."
    elapsed=$(($(date +%s) - CONSOLE_STEP_STARTED))
    [ "$elapsed" -ge 1 ] && text="$text  $(console_duration "$elapsed")"
    [ -n "$1" ] && text="$text  $1"
    # A wrapped line cannot be redrawn with a carriage return.
    width="$(tput cols 2>/dev/null || echo 80)"
    width=$((width - 1))
    if [ "${#text}" -gt "$width" ]; then
        text="${text:0:$((width - ${#CONSOLE_GLYPH_MORE}))}$CONSOLE_GLYPH_MORE"
    fi
    printf '\r%s%s%s\033[K' "$CONSOLE_DIM" "$text" "$CONSOLE_RESET"
    CONSOLE_PENDING=1
}

console_done() {
    # console_done [ok|fail|warn|skip] [detail]
    local status="${1:-ok}" detail="$2" label="$CONSOLE_STEP" notes="$CONSOLE_NOTES" note
    [ -n "$label" ] || return 0
    CONSOLE_STEP=""
    CONSOLE_NOTES=""
    console_step "$status" "$label" "$detail" "$(($(date +%s) - CONSOLE_STEP_STARTED))"
    while IFS= read -r note; do
        [ -n "$note" ] && _console_line "      ${CONSOLE_DIM}${note}${CONSOLE_RESET}"
    done <<EOF
$notes
EOF
    return 0
}

console_output() {
    # console_output <command shown> <exit status> <file>: a failed command's captured output.
    local shown="$1" status="$2" file="$3" total hidden log
    console_blank
    if [ -n "$shown" ]; then
        _console_line "  ${CONSOLE_DIM}\$ $shown  (exit $status)${CONSOLE_RESET}"
        console_blank
    fi
    total="$(wc -l < "$file" | tr -d ' ')"
    if [ "$total" -gt "$CONSOLE_DUMP_LINES" ]; then
        hidden=$((total - CONSOLE_DUMP_LINES))
        log="${TMPDIR:-/tmp}/dataforge-$(date +%Y%m%d-%H%M%S).log"
        cp "$file" "$log"
        _console_line "  ${CONSOLE_DIM}$CONSOLE_GLYPH_MORE $hidden earlier lines in $log${CONSOLE_RESET}"
    fi
    tail -n "$CONSOLE_DUMP_LINES" "$file"
    CONSOLE_AFTER_BLANK=0
    console_blank
}

console_warning() {
    # console_warning <text> [note...]
    local note
    _console_line "  ${CONSOLE_YELLOW}${CONSOLE_GLYPH_WARN} $1${CONSOLE_RESET}" >&2
    shift
    for note in "$@"; do
        _console_line "      ${CONSOLE_DIM}${note}${CONSOLE_RESET}" >&2
    done
}

console_result() {
    # console_result <ok|fail|warn|plain> <message> [line...]
    local status="$1" color line
    case "$status" in
        ok) color="$CONSOLE_BOLD$CONSOLE_GREEN" ;;
        fail) color="$CONSOLE_BOLD$CONSOLE_RED" ;;
        warn) color="$CONSOLE_BOLD$CONSOLE_YELLOW" ;;
        *) color="$CONSOLE_BOLD" ;;
    esac
    if [ -n "$CONSOLE_STEP" ]; then
        if [ "$status" = "fail" ]; then console_done fail; else console_done; fi
    fi
    console_blank
    _console_line "${color}$2${CONSOLE_RESET}"
    shift 2
    for line in "$@"; do
        _console_line "  $line"
    done
}

console_hint() {
    _console_line "${CONSOLE_CYAN}$1${CONSOLE_RESET}"
}

console_run() {
    # console_run [-C dir] <command...>: runs it captured while the step's line stays live.
    # Sets CONSOLE_EXIT, and CONSOLE_OUTPUT to a file the caller may read until the next run.
    local pid previous_trap dir="."
    if [ "$1" = "-C" ]; then
        dir="$2"
        shift 2
    fi
    [ -z "$CONSOLE_OUTPUT" ] || rm -f "$CONSOLE_OUTPUT"
    CONSOLE_OUTPUT="$(mktemp "${TMPDIR:-/tmp}/dataforge-console.XXXXXX")"
    (cd "$dir" && PYTHONUNBUFFERED=1 exec "$@") >"$CONSOLE_OUTPUT" 2>&1 </dev/null &
    pid=$!
    # Background jobs ignore SIGINT without job control, so Ctrl+C is passed on by hand.
    previous_trap="$(trap -p INT)"
    trap "kill -TERM $pid 2>/dev/null; ${previous_trap:-trap - INT}; kill -INT \$\$" INT
    while kill -0 "$pid" 2>/dev/null; do
        console_update "$(tail -n 1 "$CONSOLE_OUTPUT" 2>/dev/null | tr -d '\r')"
        sleep 0.2
    done
    CONSOLE_EXIT=0
    wait "$pid" || CONSOLE_EXIT=$?
    if [ -n "$previous_trap" ]; then eval "$previous_trap"; else trap - INT; fi
    return 0
}

console_run_step() {
    # console_run_step <label> <failure message> [-C dir] <command...>
    # One captured command as one step. On success the step stays open for the caller's
    # console_done, worded from "$CONSOLE_OUTPUT"; a failure closes it, prints the output,
    # sets CONSOLE_FAILURE and returns non-zero.
    local label="$1" failure="$2"
    shift 2
    console_start "$label"
    console_run "$@"
    if [ "$CONSOLE_EXIT" = "0" ]; then
        return 0
    fi
    [ "$1" != "-C" ] || shift 2
    console_done fail "exit $CONSOLE_EXIT"
    console_output "$(basename "$1") ${*:2}" "$CONSOLE_EXIT" "$CONSOLE_OUTPUT"
    CONSOLE_FAILURE="$failure"
    return 1
}
