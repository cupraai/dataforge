from __future__ import annotations

import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import events
from filesystem import looks_like_windows_path, preference_folder_key
from folder_fingerprint import compute_folder_fingerprint
from schemas import FolderEvent

logger = logging.getLogger(__name__)

#: Must outlast a hidden tab's safety poll.
WATCH_TTL_SECONDS = 120.0

#: Floor bounds detection latency; ceiling stops back-to-back slow scans.
MIN_INTERVAL_SECONDS = 1.0
MAX_INTERVAL_SECONDS = 10.0

#: So a big folder does not spend a core on watching.
INTERVAL_SCAN_RATIO = 4.0

IDLE_INTERVAL_SECONDS = 5.0

#: Well under ``MIN_INTERVAL_SECONDS``.
TICK_SECONDS = 0.25

#: A folder on a dead drive delays only itself.
WATCH_WORKERS = 4

#: A dead network drive blocks for the SMB timeout; only an unreadable folder backs off.
SLOW_SCAN_SECONDS = 1.0
BACKOFF_SECONDS = 30.0

#: Pushed for an unreadable folder; the client's re-read reports the error.
UNREADABLE_FINGERPRINT = ""

_watches: dict[str, dict[str, float]] = {}

#: A navigation briefly leaves the previous folder watched.
MAX_FOLDERS_PER_TAB = 3


def watch_key(path: str) -> str:
    """Windows folds with ``lower``, not ``casefold``."""
    key = preference_folder_key(path)
    if os.name == "nt" or looks_like_windows_path(key):
        return key.lower()
    return key


def touch(tab_id: str, path: str) -> None:
    """Record that ``tab_id`` is looking at ``path``."""
    key = watch_key(path)
    # A blank path would scan the process cwd.
    if not tab_id or not key:
        return

    folders = _watches.setdefault(tab_id, {})
    folders[key] = time.monotonic()

    if len(folders) > MAX_FOLDERS_PER_TAB:
        for folder in sorted(folders, key=folders.__getitem__)[:-MAX_FOLDERS_PER_TAB]:
            del folders[folder]


def watchers_by_folder() -> dict[str, set[str]]:
    """Only tabs holding a live stream count."""
    connected = events.connected_tab_ids()
    cutoff = time.monotonic() - WATCH_TTL_SECONDS

    watchers: dict[str, set[str]] = {}
    for tab_id, folders in list(_watches.items()):
        for folder, seen in list(folders.items()):
            if seen < cutoff:
                del folders[folder]
            elif tab_id in connected:
                watchers.setdefault(folder, set()).add(tab_id)

        if not folders:
            del _watches[tab_id]

    return watchers


def clear_watches_for_tests() -> None:
    _watches.clear()


def _scan(folder: str) -> str:
    return compute_folder_fingerprint(Path(folder)) or UNREADABLE_FINGERPRINT


async def run_folder_watch_feed() -> None:
    seen: dict[str, str] = {}
    #: Each folder is paced by its own scan.
    due: dict[str, float] = {}
    scanning: dict[str, asyncio.Task[None]] = {}

    # ``os.scandir`` on a dead drive would block the default executor.
    executor = ThreadPoolExecutor(max_workers=WATCH_WORKERS, thread_name_prefix="folder-watch")
    loop = asyncio.get_running_loop()

    async def scan(folder: str) -> None:
        started = time.monotonic()
        try:
            fingerprint = await loop.run_in_executor(executor, _scan, folder)
        except Exception:
            logger.debug("Folder scan failed for %s", folder, exc_info=True)
            due[folder] = time.monotonic() + BACKOFF_SECONDS
            return

        elapsed = time.monotonic() - started
        if elapsed >= SLOW_SCAN_SECONDS and fingerprint == UNREADABLE_FINGERPRINT:
            pause = BACKOFF_SECONDS
        else:
            pause = min(
                max(elapsed * INTERVAL_SCAN_RATIO, MIN_INTERVAL_SECONDS), MAX_INTERVAL_SECONDS
            )
        due[folder] = time.monotonic() + pause

        # A slow scan outlives navigations and tabs.
        tab_ids = watchers_by_folder().get(folder)
        if not tab_ids or seen.get(folder) == fingerprint:
            return

        seen[folder] = fingerprint
        events.publish_to_tabs(
            tab_ids,
            FolderEvent(path=folder, fingerprint=fingerprint).model_dump(),
        )

    def finished(folder: str, task: asyncio.Task[None]) -> None:
        scanning.pop(folder, None)
        if not task.cancelled() and task.exception() is not None:
            logger.error("Folder watch failed for %s", folder, exc_info=task.exception())

    try:
        while True:
            watchers = watchers_by_folder()
            if not watchers:
                # The next watcher hydrates over REST.
                seen.clear()
                due.clear()
                await asyncio.sleep(IDLE_INTERVAL_SECONDS)
                continue

            now = time.monotonic()
            for folder in watchers:
                # A blocked scan holds a worker, never a queue.
                if folder in scanning or due.get(folder, 0.0) > now:
                    continue
                task = asyncio.create_task(scan(folder))
                scanning[folder] = task
                task.add_done_callback(lambda done, folder=folder: finished(folder, done))

            for folder in [name for name in seen.keys() | due.keys() if name not in watchers]:
                seen.pop(folder, None)
                due.pop(folder, None)

            await asyncio.sleep(TICK_SECONDS)
    finally:
        for task in scanning.values():
            task.cancel()
        executor.shutdown(wait=False)
