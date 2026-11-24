"""Server settings shared by the API, its CORS policy, the bundled UI and the server scripts."""

from __future__ import annotations

import os

from env_file import env_str

DEFAULT_API_PORT = 18080
DEFAULT_UI_PORT = 18081

# A browser treats the two spellings of loopback as distinct origins.
_LOOPBACK_HOSTS = ("localhost", "127.0.0.1")

_MIN_PORT = 1
_MAX_PORT = 65535

_FALSEY = {"0", "false", "no", "off", ""}


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in _FALSEY


def _env_port(name: str, default: int) -> int:
    raw = env_str(name)
    if not raw:
        return default
    try:
        port = int(raw)
    except ValueError:
        return default
    if not _MIN_PORT <= port <= _MAX_PORT:
        return default
    return port


def get_api_port() -> int:
    # Same validation as the launchers, so both wait on the port the server binds.
    return _env_port("DATAFORGE_API_PORT", DEFAULT_API_PORT)


def get_ui_port() -> int:
    return _env_port("DATAFORGE_UI_PORT", DEFAULT_UI_PORT)


def reload_enabled() -> bool:
    return _env_flag("DATAFORGE_RELOAD", True)


def get_cors_origins() -> tuple[str, ...]:
    port = get_ui_port()
    return tuple(f"http://{host}:{port}" for host in _LOOPBACK_HOSTS)


def serve_ui_enabled() -> bool:
    return _env_flag("DATAFORGE_SERVE_UI", False)
