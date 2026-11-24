"""Development server with hot reload; test modules are excluded.
``--no-reload`` freezes it; a finite graceful shutdown keeps SSE from hanging the reloader."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import uvicorn

# Before any backend import: older interpreters die on PEP 695 with a bare SyntaxError.
from py_version import require_python

require_python()

BACKEND = Path(__file__).resolve().parent.parent / "backend"

DEFAULT_HOST = "127.0.0.1"

# Glob patterns for uvicorn's watchfiles filter (pathlib Path.match). Only *.py files reach it.
RELOAD_EXCLUDES = [
    "test_*.py",
    "_test_*.py",
    "testing_fixtures.py",
    # Excludes must be absolute: FileFilter compares them to the absolute paths watchfiles reports.
    str(BACKEND / ".venv"),
    str(BACKEND / "data"),
]

# watchfiles debounces ~1.6s; this widens it so a multi-file save lands as one restart.
RELOAD_DELAY = 1.0

# Cap how long a reload waits for open connections; SSE streams otherwise never close.
GRACEFUL_SHUTDOWN_SECONDS = 2

def _parse_args(
    argv: list[str] | None, *, default_port: int, default_reload: bool
) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the DataForge API with hot reload.")
    parser.add_argument(
        "--host",
        default=os.environ.get("DATAFORGE_API_HOST", DEFAULT_HOST),
        help=f"Interface to bind (default: {DEFAULT_HOST}, or DATAFORGE_API_HOST).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=default_port,
        help=f"Port to bind (default: {default_port}, from DATAFORGE_API_PORT).",
    )
    reload_flags = parser.add_mutually_exclusive_group()
    reload_flags.add_argument(
        "--reload",
        dest="reload",
        action="store_true",
        default=None,
        help="Force hot reload on (the default).",
    )
    reload_flags.add_argument(
        "--no-reload",
        dest="reload",
        action="store_false",
        help="Run without the reloader. Use while a long job is running.",
    )
    args = parser.parse_args(argv)
    if args.reload is None:
        args.reload = default_reload
    return args


def build_uvicorn_kwargs(*, host: str, port: int, reload: bool) -> dict[str, Any]:
    """``uvicorn.run`` kwargs, exposed so tests pin the finite graceful shutdown."""
    kwargs: dict[str, Any] = {
        "app": "main:app",
        "host": host,
        "port": port,
        "reload": reload,
        # Always finite: Ctrl+C with an open SSE stream must not hang either.
        "timeout_graceful_shutdown": GRACEFUL_SHUTDOWN_SECONDS,
    }
    if reload:
        # uvicorn warns about these when reload is off.
        kwargs["reload_excludes"] = list(RELOAD_EXCLUDES)
        kwargs["reload_delay"] = RELOAD_DELAY
    return kwargs


if __name__ == "__main__":
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))
    from env_file import load_env_file
    from logging_config import configure_logging

    load_env_file()
    configure_logging()

    from server_settings import get_api_port, reload_enabled

    # Parsed after .env so DATAFORGE_API_PORT can come from there.
    options = _parse_args(None, default_port=get_api_port(), default_reload=reload_enabled())

    # The request guard reads the bound address from here, and --host may have overridden it.
    os.environ["DATAFORGE_API_HOST"] = options.host

    reload_state = "on" if options.reload else "off (--no-reload)"
    print(
        f"DataForge API on http://{options.host}:{options.port}  |  hot reload: {reload_state}",
        flush=True,
    )

    kwargs = build_uvicorn_kwargs(host=options.host, port=options.port, reload=options.reload)
    uvicorn.run(**kwargs)
