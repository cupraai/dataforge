"""One prompt at a time, so a stop only ever reaches a prompt DataForge queued."""

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
    """A cancel arrived while the prompt waited or ran."""


_gpu_lock = threading.Lock()


@contextmanager
def gpu_slot(should_cancel: ShouldCancel | None) -> Generator[None]:
    """Polls so a cancel is noticed while another file holds the slot."""
    while not _gpu_lock.acquire(timeout=COMFY_POLL_INTERVAL_SECONDS):
        if should_cancel and should_cancel():
            raise ComfyRunCancelled

    try:
        yield
    finally:
        _gpu_lock.release()


def request_stop(client: httpx.Client, prompt_id: str) -> None:
    """Interrupt it if running, or drop it if pending."""
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
    """Poll for the output node's last file; checks cancel, since a file can take an hour."""
    return await_outputs(
        client,
        prompt_id,
        output_node=output_node,
        timeout=timeout,
        should_cancel=should_cancel,
        on_running=on_running,
    )[-1]


def await_outputs(
    client: httpx.Client,
    prompt_id: str,
    *,
    output_node: str,
    timeout: float,
    should_cancel: ShouldCancel | None,
    on_running: Callable[[], None] | None = None,
) -> list[dict[str, str]]:
    """Every file the output node wrote."""
    deadline = time.monotonic() + timeout
    stop_requested = False
    reported_running = on_running is None

    while True:
        entry = fetch_history(client, prompt_id)
        if entry is not None and history_is_finished(entry):
            error = history_error_text(entry)
            if error:
                raise ComfyPromptError(error)

            # This node only, not a preview it also wrote.
            refs = history_outputs(entry, node_id=output_node)
            if not refs:
                raise ComfyPromptError(NO_OUTPUT_MESSAGE)
            return refs

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
