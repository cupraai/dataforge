from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from comfy_settings import get_comfy_base_url
from external.comfy_logs import LOG_TAIL_LINES, assemble_log_lines

COMFY_REQUEST_TIMEOUT_SECONDS = 10.0
# Per read/write, not per transfer, so a long download is covered.
COMFY_TRANSFER_TIMEOUT_SECONDS = 120.0
COMFY_POLL_INTERVAL_SECONDS = 1.0

DOWNLOAD_CHUNK_BYTES = 64 * 1024

# ComfyUI has no delete-input endpoint.
COMFY_INPUT_SUBFOLDER = "dataforge"

# Internal and unversioned.
COMFY_LOGS_PATH = "/internal/logs/raw"

_TERMINAL_STATUS_STRINGS = frozenset({"success", "error"})


class ComfyError(Exception):
    pass


class ComfyUnavailableError(ComfyError):
    pass


class ComfyPromptError(ComfyError):
    """Rejected the graph, or failed while executing it."""


def open_comfy_client(timeout: float) -> httpx.Client:
    """So a job keeps talking to the ComfyUI it started on."""
    return httpx.Client(base_url=get_comfy_base_url(), timeout=timeout)


def _media_type(source: Path) -> str:
    guessed, _ = mimetypes.guess_type(source.name)
    return guessed or "application/octet-stream"


def _node_error_text(payload: dict[str, Any]) -> str:
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        details = error.get("details")
        if isinstance(message, str) and message:
            return f"{message}: {details}" if isinstance(details, str) and details else message
    if isinstance(error, str) and error:
        return error

    node_errors = payload.get("node_errors")
    if isinstance(node_errors, dict):
        for node_id, entry in node_errors.items():
            errors = entry.get("errors") if isinstance(entry, dict) else None
            first = errors[0] if isinstance(errors, list) and errors else None
            message = first.get("message") if isinstance(first, dict) else None
            if isinstance(message, str) and message:
                return f"node {node_id}: {message}"
        return "; ".join(str(node_id) for node_id in node_errors)

    return "ComfyUI rejected the workflow"


def upload_media(
    client: httpx.Client,
    source: Path,
    *,
    name: str,
    subfolder: str = COMFY_INPUT_SUBFOLDER,
) -> str:
    """Upload into ComfyUI's input folder, streamed; ``name`` must be unique per file."""
    data = {"type": "input", "subfolder": subfolder, "overwrite": "true"}

    try:
        with source.open("rb") as handle:
            # The field is "image" for video too.
            files = {"image": (name, handle, _media_type(source))}
            response = client.post(
                "/upload/image",
                files=files,
                data=data,
                timeout=COMFY_TRANSFER_TIMEOUT_SECONDS,
            )
        response.raise_for_status()
        payload = response.json()
    except OSError as error:
        raise ComfyError(f"Could not read {source.name}: {error}") from error
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error
    except json.JSONDecodeError as error:
        raise ComfyError("ComfyUI returned an unreadable upload response") from error

    stored = payload.get("name") if isinstance(payload, dict) else None
    if not isinstance(stored, str) or not stored:
        raise ComfyError("ComfyUI accepted the upload without naming the file")

    folder = payload.get("subfolder") if isinstance(payload, dict) else ""
    return f"{folder}/{stored}" if isinstance(folder, str) and folder else stored


def submit_prompt(client: httpx.Client, prompt: dict[str, Any], *, client_id: str) -> str:
    """A 200 with ``node_errors`` is a reject."""
    try:
        response = client.post(
            "/prompt",
            json={"prompt": prompt, "client_id": client_id},
            timeout=COMFY_REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error

    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = {}

    if response.status_code >= 400:
        raise ComfyPromptError(_node_error_text(payload if isinstance(payload, dict) else {}))

    if not isinstance(payload, dict):
        raise ComfyError("ComfyUI returned an unreadable prompt response")

    if payload.get("node_errors"):
        raise ComfyPromptError(_node_error_text(payload))

    prompt_id = payload.get("prompt_id")
    if not isinstance(prompt_id, str) or not prompt_id:
        raise ComfyError("ComfyUI queued the workflow without returning a prompt id")

    return prompt_id


def fetch_history(client: httpx.Client, prompt_id: str) -> dict[str, Any] | None:
    """None while still queued or executing."""
    try:
        response = client.get(
            f"/history/{prompt_id}",
            timeout=COMFY_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error
    except json.JSONDecodeError as error:
        raise ComfyError("ComfyUI returned an unreadable history response") from error

    if not isinstance(payload, dict):
        return None

    entry = payload.get(prompt_id)
    return entry if isinstance(entry, dict) else None


def history_is_finished(entry: dict[str, Any]) -> bool:
    status = entry.get("status")
    if not isinstance(status, dict):
        # Older builds report no status block.
        return bool(entry.get("outputs"))

    if status.get("completed") is True:
        return True
    return str(status.get("status_str", "")).lower() in _TERMINAL_STATUS_STRINGS


def history_error_text(entry: dict[str, Any]) -> str | None:
    """None if it succeeded."""
    status = entry.get("status")
    if not isinstance(status, dict):
        return None
    if str(status.get("status_str", "")).lower() != "error":
        return None

    messages = status.get("messages")
    if isinstance(messages, list):
        for message in reversed(messages):
            if not isinstance(message, list) or len(message) < 2:
                continue
            kind, data = message[0], message[1]
            if kind != "execution_error" or not isinstance(data, dict):
                continue
            text = data.get("exception_message")
            node = data.get("node_type")
            if isinstance(text, str) and text:
                return f"{node}: {text}" if isinstance(node, str) and node else text

    return "ComfyUI reported an execution error"


def _node_refs(node_output: object) -> list[dict[str, str]]:
    """Matched by shape, not key: each save node files under its own key."""
    if not isinstance(node_output, dict):
        return []

    refs: list[dict[str, str]] = []
    for value in node_output.values():
        if not isinstance(value, list):
            continue
        for item in value:
            if not isinstance(item, dict):
                continue
            filename = item.get("filename")
            if not isinstance(filename, str) or not filename:
                continue
            refs.append(
                {
                    "filename": filename,
                    "subfolder": str(item.get("subfolder") or ""),
                    "type": str(item.get("type") or "output"),
                }
            )
    return refs


def history_outputs(entry: dict[str, Any], *, node_id: str | None = None) -> list[dict[str, str]]:
    """``node_id`` tells a graph's real output from a preview it also emitted."""
    outputs = entry.get("outputs")
    if not isinstance(outputs, dict):
        return []

    if node_id is not None:
        return _node_refs(outputs.get(node_id))

    refs: list[dict[str, str]] = []
    for node_output in outputs.values():
        refs.extend(_node_refs(node_output))
    return refs


def download_view_to(client: httpx.Client, ref: dict[str, str], destination: Path) -> None:
    """Streamed to a file, not held in memory."""
    try:
        with (
            client.stream(
                "GET",
                "/view",
                params=ref,
                timeout=COMFY_TRANSFER_TIMEOUT_SECONDS,
            ) as response,
            destination.open("wb") as handle,
        ):
            response.raise_for_status()
            for chunk in response.iter_bytes(DOWNLOAD_CHUNK_BYTES):
                handle.write(chunk)
    except httpx.HTTPError as error:
        destination.unlink(missing_ok=True)
        raise ComfyUnavailableError(str(error)) from error
    except OSError as error:
        destination.unlink(missing_ok=True)
        raise ComfyError(f"Could not write {destination.name}: {error}") from error


def fetch_queue(client: httpx.Client) -> tuple[list[str], list[str]]:
    try:
        response = client.get("/queue", timeout=COMFY_REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error
    except json.JSONDecodeError as error:
        raise ComfyError("ComfyUI returned an unreadable queue response") from error

    if not isinstance(payload, dict):
        return ([], [])

    def _ids(key: str) -> list[str]:
        entries = payload.get(key)
        if not isinstance(entries, list):
            return []
        return [
            entry[1]
            for entry in entries
            if isinstance(entry, list) and len(entry) > 1 and isinstance(entry[1], str)
        ]

    return (_ids("queue_running"), _ids("queue_pending"))


def interrupt(client: httpx.Client, prompt_id: str) -> None:
    try:
        response = client.post(
            "/interrupt",
            json={"prompt_id": prompt_id},
            timeout=COMFY_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error


def delete_queued(client: httpx.Client, prompt_id: str) -> None:
    try:
        response = client.post(
            "/queue",
            json={"delete": [prompt_id]},
            timeout=COMFY_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error


def fetch_node_info(client: httpx.Client, class_type: str) -> dict[str, Any] | None:
    """None when the node is not installed."""
    try:
        response = client.get(
            f"/object_info/{quote(class_type, safe='')}", timeout=COMFY_REQUEST_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error
    except json.JSONDecodeError as error:
        raise ComfyError("ComfyUI returned an unreadable node description") from error

    info = payload.get(class_type) if isinstance(payload, dict) else None
    return info if isinstance(info, dict) else None


def fetch_raw_log_entries(client: httpx.Client) -> list[dict[str, Any]]:
    """Oldest first; ComfyUI bounds the window."""
    try:
        response = client.get(COMFY_LOGS_PATH, timeout=COMFY_REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as error:
        raise ComfyUnavailableError(str(error)) from error
    except json.JSONDecodeError as error:
        raise ComfyError("ComfyUI returned an unreadable log response") from error

    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return []

    return [entry for entry in entries if isinstance(entry, dict)]


def read_log_lines(*, limit: int = LOG_TAIL_LINES) -> list[str] | None:
    """None when unreadable; an empty list when nothing was written."""
    try:
        with open_comfy_client(COMFY_REQUEST_TIMEOUT_SECONDS) as client:
            entries = fetch_raw_log_entries(client)
    except ComfyError:
        return None

    return assemble_log_lines(entries, limit=limit)


def probe_available() -> bool:
    try:
        with open_comfy_client(COMFY_REQUEST_TIMEOUT_SECONDS) as client:
            response = client.get("/system_stats")
            response.raise_for_status()
    except httpx.HTTPError:
        return False
    return True
