"""The LoRAs ComfyUI can load, named as it names them, with AI-Toolkit's saves told apart."""

from __future__ import annotations

import math
import re
from collections.abc import Sequence

from external.comfy_client import (
    COMFY_REQUEST_TIMEOUT_SECONDS,
    ComfyError,
    ComfyUnavailableError,
    fetch_lora_names,
    open_comfy_client,
)
from schemas import ComfyLora, ComfyLorasResponse

#: AI-Toolkit saves ``<run>_000001500.safetensors`` every few steps and ``<run>.safetensors`` last.
_NUMBERED_SAVE = re.compile(r"^(?P<run>.+)_(?P<step>\d{9})$")


def describe_lora(name: str) -> ComfyLora:
    """``name`` may carry ComfyUI's subfolder with either separator."""
    base = re.split(r"[\\/]", name)[-1]
    stem = base.rsplit(".", 1)[0] if "." in base else base
    match = _NUMBERED_SAVE.match(stem)
    if match is None:
        return ComfyLora(name=name, stem=stem, run=stem)
    return ComfyLora(name=name, stem=stem, run=match["run"], step=int(match["step"]))


def label_compared_loras(names: Sequence[str]) -> list[tuple[str, str]]:
    """Name and label: the saves of one run in training order, else each file by its own name."""
    loras = [describe_lora(name) for name in names]
    if len(loras) < 2 or len({lora.run for lora in loras}) > 1:
        return [(lora.name, lora.stem) for lora in loras]
    # The run's last save carries no step.
    loras.sort(key=lambda lora: math.inf if lora.step is None else lora.step)
    return [(lora.name, "final" if lora.step is None else f"step {lora.step}") for lora in loras]


def list_comfy_loras() -> ComfyLorasResponse:
    """Never raises: a stopped ComfyUI is just unavailable."""
    try:
        with open_comfy_client(COMFY_REQUEST_TIMEOUT_SECONDS) as client:
            names = fetch_lora_names(client)
    except ComfyUnavailableError:
        return ComfyLorasResponse(available=False)
    except ComfyError as error:
        return ComfyLorasResponse(available=True, error=str(error))

    if names is None:
        return ComfyLorasResponse(
            available=True, error="ComfyUI did not list its LoRAs. Update ComfyUI and try again."
        )
    return ComfyLorasResponse(available=True, loras=[describe_lora(name) for name in names])
