"""Tells every open tab when a ComfyUI preset is added, removed or exported again."""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

import events
from external.comfy_workflows import comfy_presets_fingerprint
from schemas import ComfyPresetsEvent

logger = logging.getLogger(__name__)

#: A handful of stats, so one second costs nothing.
SCAN_SECONDS = 1.0

#: How soon a first tab is noticed.
IDLE_SECONDS = 2.0


async def run_comfy_preset_feed() -> None:
    # Kept while no tab is open: a change meanwhile is announced to the next one.
    seen: str | None = None

    # A presets folder on a dead drive must not block the default executor.
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="comfy-presets")
    loop = asyncio.get_running_loop()
    try:
        while True:
            if events.subscriber_count() == 0:
                await asyncio.sleep(IDLE_SECONDS)
                continue

            try:
                fingerprint = await loop.run_in_executor(executor, comfy_presets_fingerprint)
            except Exception:
                logger.debug("Preset scan failed", exc_info=True)
            else:
                # The first scan announces too: a tab may have read the list before it.
                if fingerprint != seen:
                    seen = fingerprint
                    events.publish(ComfyPresetsEvent().model_dump())
            await asyncio.sleep(SCAN_SECONDS)
    finally:
        executor.shutdown(wait=False)
