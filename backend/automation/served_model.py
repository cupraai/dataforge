"""The model a vision server answers with, and the reasoning levels its chat template accepts.

Read through llama.cpp's ``/v1/models`` and ``/props``, which Unsloth Studio serves as well. Other
servers do not report a template, so their levels stay unknown and every level is sent as chosen.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx
import openai

from chat_template import nearest_effort, template_efforts
from schemas import ReasoningEffort

logger = logging.getLogger(__name__)

PROBE_TIMEOUT = httpx.Timeout(5.0, connect=2.0)


@dataclass(frozen=True)
class ServedModel:
    """``efforts`` follows ``template_efforts``: ``()`` has no levels, ``None`` is unknown.

    ``problem`` says why no model could be named, for the user to fix; ``reachable`` is false
    only when the server did not answer at all, which no job could get past.
    """

    model: str | None = None
    efforts: tuple[ReasoningEffort, ...] | None = None
    problem: str | None = None
    reachable: bool = True


def _server_root(base_url: object) -> str:
    return str(base_url).rstrip("/").removesuffix("/v1")


def _router_state(entry: Any) -> str | None:
    status = getattr(entry, "status", None)
    value = status.get("value") if isinstance(status, dict) else None
    return value if isinstance(value, str) else None


def _is_loaded(entry: Any) -> bool | None:
    """A llama.cpp router and Unsloth Studio list every model they can load; a plain server does
    not say, since it lists only the one it runs."""
    loaded = getattr(entry, "loaded", None)
    if isinstance(loaded, bool):
        return loaded
    state = _router_state(entry)
    return None if state is None else state == "loaded"


def _listing_problem(exc: Exception) -> str:
    if isinstance(exc, openai.AuthenticationError | openai.PermissionDeniedError):
        return "The server refused the API key"
    if isinstance(exc, openai.APIConnectionError):
        return "The server did not answer"
    if isinstance(exc, openai.APIStatusError):
        return f"The server answered HTTP {exc.status_code}"
    return "The server's model list could not be read"


def _chat_template(client: Any, model: str, *, router: bool) -> str | None:
    response = client.get(
        f"{_server_root(client.base_url)}/props",
        cast_to=httpx.Response,
        options={"params": {"model": model} if router else {}, "timeout": PROBE_TIMEOUT},
    )
    template = response.json().get("chat_template")
    return template if isinstance(template, str) and template.strip() else None


def read_served_model(client: Any, configured: str) -> ServedModel:
    """A server that answers any id with its loaded model gets that model named instead."""
    try:
        entries = {
            entry.id: entry
            for entry in client.models.list(timeout=PROBE_TIMEOUT)
            if isinstance(getattr(entry, "id", None), str)
        }
    except Exception as exc:
        logger.debug("Could not list the vision server's models: %s", exc)
        return ServedModel(
            problem=_listing_problem(exc),
            reachable=not isinstance(exc, openai.APIConnectionError),
        )
    loaded = [model for model, entry in entries.items() if _is_loaded(entry)]
    if configured in entries:
        model = configured
    elif len(loaded) == 1:
        model = loaded[0]
    elif len(entries) == 1:
        model = next(iter(entries))
    else:
        return ServedModel(problem="The server has no single loaded model")

    # Reading an unloaded router model's template would load it, and Studio's describes another.
    if _is_loaded(entries[model]) is False:
        return ServedModel(model)
    try:
        template = _chat_template(client, model, router=_router_state(entries[model]) is not None)
    except Exception as exc:
        logger.debug("Could not read the chat template of %s: %s", model, exc)
        return ServedModel(model)
    return ServedModel(model, template_efforts(template) if template else None)


def resolve_reasoning_effort(client: Any, effort: str, *, mode: str, model: str) -> str | None:
    """The level a job sends: the nearest the template accepts, or ``None`` if it reads none."""
    if mode == "instruct":
        return effort
    served = read_served_model(client, model)
    if served.efforts is None:
        return effort
    if not served.efforts:
        logger.info("%s has no reasoning effort levels, so none is sent", served.model)
        return None
    resolved = nearest_effort(effort, served.efforts)
    if resolved != effort:
        logger.info("%s has no %s reasoning effort; sending %s", served.model, effort, resolved)
    return resolved
