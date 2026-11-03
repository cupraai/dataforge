"""Run one prompt on ComfyUI at a time, for every caller: the prep job and the editor's fills.

One slot means a stop request can only ever reach a prompt DataForge itself queued. ComfyUI has no
per-prompt interrupt, so the queue is read before interrupting, and someone else's prompt is never
touched.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Generator
from contextlib import contextmanager, suppress

import httpx

from external.comfy_client import (
    COMFY_POLL_INTERVAL_SECONDS,
    ComfyError,
    ComfyPromptError,
    delete_queued,
    fetch_history,
    fetch_queue,
    history_error_text,
    history_is_finished,
    history_outputs,
    interrupt,
)

NO_OUTPUT_MESSAGE = "The workflow produced no output"

type ShouldCancel = Callable[[], bool]


class ComfyRunCancelled(Exception):
    """Raised when a cancel arrives while a prompt waits for the slot or runs in ComfyUI."""


_gpu_lock = threading.Lock()


@contextmanager
def gpu_slot(should_cancel: ShouldCancel | None) -> Generator[None]:
    """Wait for the slot in polls, not one blocking acquire: a whole video file can hold it for an
    hour, and a thread parked in ``acquire`` never looks at ``should_cancel`` again."""
    while not _gpu_lock.acquire(timeout=COMFY_POLL_INTERVAL_SECONDS):
        if should_cancel and should_cancel():
            raise ComfyRunCancelled

    try:
        yield
    finally:
        _gpu_lock.release()


def request_stop(client: httpx.Client, prompt_id: str) -> None:
    """Interrupt ``prompt_id`` if it is the running one, or drop it if it is still pending."""
    try:
        running, pending = fetch_queue(client)
    except ComfyError:
        return

    if prompt_id in running:
        with suppress(ComfyError):
            interrupt(client, prompt_id)
        return

    if prompt_id in pending:
        with suppress(ComfyError):
            delete_queued(client, prompt_id)


def await_output(
    client: httpx.Client,
    prompt_id: str,
    *,
    output_node: str,
    timeout: float,
    should_cancel: ShouldCancel | None,
    on_running: Callable[[], None] | None = None,
) -> dict[str, str]:
    """Poll until the prompt finishes and return the output node's last file.

    Cancel is checked here because one file can take an hour. ``on_running`` fires once, when
    ComfyUI starts executing the prompt rather than holding it in its queue.
    """
    deadline = time.monotonic() + timeout
    stop_requested = False
    reported_running = on_running is None

    while True:
        entry = fetch_history(client, prompt_id)
        if entry is not None and history_is_finished(entry):
            error = history_error_text(entry)
            if error:
                raise ComfyPromptError(error)

            # This node only: a graph that also wrote a preview would otherwise return the preview.
            refs = history_outputs(entry, node_id=output_node)
            if not refs:
                raise ComfyPromptError(NO_OUTPUT_MESSAGE)
            return refs[-1]

        if not stop_requested and should_cancel and should_cancel():
            stop_requested = True
            request_stop(client, prompt_id)
            raise ComfyRunCancelled

        if time.monotonic() > deadline:
            request_stop(client, prompt_id)
            raise ComfyError(f"ComfyUI did not finish within {timeout:.0f}s")

        if not reported_running and on_running is not None:
            with suppress(ComfyError):
                running, _ = fetch_queue(client)
                if prompt_id in running:
                    reported_running = True
                    on_running()

        time.sleep(COMFY_POLL_INTERVAL_SECONDS)
