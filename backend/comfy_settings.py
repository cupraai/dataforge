"""Where ComfyUI lives and how long it is allowed to take. Values are read at call time, never at import."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app_settings import effective_settings
from env_file import env_str

DEFAULT_WORKFLOWS_DIR = Path(__file__).resolve().parents[1] / "comfy_workflows"

#: Tracked with the code, unlike the presets: the editor's fill depends on their exact roles.
FILL_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "comfy_fill_templates"

# Generous: waiting too little discards a result ComfyUI has already paid for.
DEFAULT_COMFY_IMAGE_TIMEOUT_SECONDS = 900.0

_MIN_IMAGE_TIMEOUT_SECONDS = 30.0

# A clip through an upscaler and an interpolator is minutes per file, not seconds.
DEFAULT_COMFY_VIDEO_TIMEOUT_SECONDS = 7200.0

_MIN_VIDEO_TIMEOUT_SECONDS = 60.0


def _env_seconds(name: str, default: float, minimum: float) -> float:
    raw = env_str(name)
    if not raw:
        return default
    try:
        seconds = float(raw)
    except ValueError:
        return default
    return seconds if seconds >= minimum else default


def get_comfy_base_url() -> str:
    """Origin without a trailing slash so paths can be appended."""
    return effective_settings().comfy_base_url


def get_comfy_workflows_dir() -> Path:
    raw = env_str("COMFY_WORKFLOWS_DIR")
    return Path(raw).expanduser() if raw else DEFAULT_WORKFLOWS_DIR


def get_comfy_image_timeout() -> float:
    return _env_seconds(
        "COMFY_IMAGE_TIMEOUT",
        DEFAULT_COMFY_IMAGE_TIMEOUT_SECONDS,
        _MIN_IMAGE_TIMEOUT_SECONDS,
    )


def get_comfy_video_timeout() -> float:
    return _env_seconds(
        "COMFY_VIDEO_TIMEOUT",
        DEFAULT_COMFY_VIDEO_TIMEOUT_SECONDS,
        _MIN_VIDEO_TIMEOUT_SECONDS,
    )


def get_comfy_media_timeout(media_type: str | None) -> float:
    """How long one file may take. Keyed on the source, which is known before the graph runs."""
    if media_type in {"video", "gif"}:
        return get_comfy_video_timeout()
    return get_comfy_image_timeout()


@dataclass(frozen=True)
class FillSettings:
    """What the fill templates load and how long they sample, from Settings > Integrations."""

    diffusion_model: str
    text_encoder: str
    vae: str
    turbo_lora: str
    quality_steps: int


def get_fill_settings() -> FillSettings:
    settings = effective_settings()
    return FillSettings(
        diffusion_model=settings.fill_diffusion_model,
        text_encoder=settings.fill_text_encoder,
        vae=settings.fill_vae,
        turbo_lora=settings.fill_turbo_lora,
        quality_steps=int(settings.fill_quality_steps),
    )
