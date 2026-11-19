#!/usr/bin/env bash
# Frees both configured ports, for when nothing supervises a leftover server.
# Only leftover python and node processes are stopped. Windows twin: stop.ps1.
#
# Usage: ./stop.sh

set -eo pipefail

# shellcheck source=scripts/dev-common.sh
. "$(cd "$(dirname "$0")" && pwd)/scripts/dev-common.sh"

say "Stopping DataForge servers..."

# 18081 serves Vite under ./dev.sh and the whole app under ./start.sh.
API_FREED=0
UI_FREED=0
clear_port "$DEV_API_PORT" "DataForge" && API_FREED=1
clear_port "$DEV_UI_PORT" "DataForge" && UI_FREED=1

if [ "$API_FREED" = "1" ] && [ "$UI_FREED" = "1" ]; then
    ok "Ports $DEV_API_PORT and $DEV_UI_PORT are free."
    exit 0
fi

exit 1
