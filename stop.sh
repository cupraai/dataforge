#!/usr/bin/env bash
# Frees both configured ports, for when nothing supervises a leftover server.
# Only leftover python and node processes are stopped. Windows twin: stop.ps1.
#
# Usage: ./stop.sh

set -eo pipefail

# shellcheck source=scripts/dev-common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/dev-common.sh"

console_title "DataForge stop"

if ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
    console_result fail "Could not check the ports: neither lsof nor ss is available."
    exit 1
fi

# The UI port serves Vite under ./dev.sh and the whole app under ./start.sh.
API_FREED=0
UI_FREED=0
clear_port "$DEV_API_PORT" report-free && API_FREED=1
clear_port "$DEV_UI_PORT" report-free && UI_FREED=1

if [ "$API_FREED" = "1" ] && [ "$UI_FREED" = "1" ]; then
    console_result ok "DataForge is stopped."
    exit 0
fi

console_result fail "Some ports are still in use."
exit 1
