"""Refuse requests a web page could forge against the local API (simple requests, DNS rebinding)."""

from __future__ import annotations

import os

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

API_HOST_ENV = "DATAFORGE_API_HOST"
DEFAULT_API_HOST = "127.0.0.1"

LOOPBACK_HOST_NAMES = frozenset({"localhost", "127.0.0.1", "[::1]"})
# Bound to every interface: other machines' names are unknown.
_WILDCARD_BINDS = frozenset({"0.0.0.0", "::", "[::]"})
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def allowed_host_names() -> frozenset[str] | None:
    """``None`` to accept any."""
    bind = os.environ.get(API_HOST_ENV, "").strip().lower() or DEFAULT_API_HOST
    if bind in _WILDCARD_BINDS:
        return None
    # An IPv6 literal is bracketed.
    named = f"[{bind}]" if ":" in bind and not bind.startswith("[") else bind
    return LOOPBACK_HOST_NAMES | {named}


def _host_name(host: str) -> str:
    """``host`` without its port: ``[::1]:8000`` is ``[::1]``."""
    host = host.strip().lower()
    if host.startswith("["):
        return host[: host.find("]") + 1] if "]" in host else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


class LocalRequestGuard:
    """Refuse an unknown Host, and state changes from a foreign Origin."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        allowed_origins: tuple[str, ...],
        allowed_hosts: frozenset[str] | None,
    ) -> None:
        self.app = app
        self.allowed_origins = frozenset(allowed_origins)
        self.allowed_hosts = allowed_hosts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        host = headers.get("host", "")
        if self.allowed_hosts is not None and _host_name(host) not in self.allowed_hosts:
            await self._refuse(scope, receive, send, "This server only answers to its own address")
            return

        origin = headers.get("origin")
        if scope["method"] not in _SAFE_METHODS and origin is not None:
            same_origin = origin == f"{scope.get('scheme', 'http')}://{host}"
            if not same_origin and origin not in self.allowed_origins:
                await self._refuse(scope, receive, send, "Cross-site requests are not accepted")
                return

        await self.app(scope, receive, send)

    @staticmethod
    async def _refuse(scope: Scope, receive: Receive, send: Send, detail: str) -> None:
        await JSONResponse({"detail": detail}, status_code=403)(scope, receive, send)
