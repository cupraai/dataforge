"""Qwen-Image 2.1 masked-edit templates; loaders and sampler take their values from Settings."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

import httpx

from comfy_settings import FILL_TEMPLATES_DIR, FillSettings, get_comfy_base_url, get_fill_settings
from external.comfy_client import (
    ComfyError,
    ComfyUnavailableError,
    combo_options,
    fetch_node_info,
)
from external.comfy_workflows import (
    ComfyWorkflow,
    ComfyWorkflowError,
    build_comfy_prompt,
    parse_comfy_workflow,
    resolve_custom_inputs,
)
from schemas import FillPreset, FillPresetState

FILL_TEMPLATES: dict[FillPreset, str] = {
    "fast": "qwen21_fill_fast",
    "quality": "qwen21_fill_quality",
}

STEPS_INPUT = "Steps"
SAMPLER_CLASS = "KSampler"
CFG_INPUT = "cfg"

#: Loader class, file-name input, and the setting and folder that supply it.
_LOADERS: dict[str, tuple[str, str, str]] = {
    "UNETLoader": ("unet_name", "diffusion_model", "diffusion_models"),
    "CLIPLoader": ("clip_name", "text_encoder", "text_encoders"),
    "VAELoader": ("vae_name", "vae", "vae"),
    "LoraLoaderModelOnly": ("lora_name", "turbo_lora", "loras"),
}

#: So the model does not reconnect partial objects across the selection.
DEFAULT_FILL_INSTRUCTION = (
    "Remove all content covered by the selection, including parts of larger objects that extend "
    "outside it. Reconstruct only the background that would be visible behind the removed "
    "content, as if that content had never been there. Keep the entire selected area free of "
    "the removed content and any continuation or replacement of it. Blend the reconstructed "
    "background seamlessly, without adding a new object, border, frame or outline"
)

#: The sampler separately masks the untouched source.
FILL_PROMPT = (
    "Edit <image1>: replace the solid magenta selection. {instruction}. "
    "Match the surrounding pattern, scale, color, lighting and perspective. "
    "Leave no trace of the magenta selection, and keep everything outside it unchanged."
)


@dataclass(frozen=True)
class FillTemplate:
    preset: FillPreset
    workflow: ComfyWorkflow
    #: Recorded with each fill for provenance.
    identity: str


def load_fill_template(preset: FillPreset) -> FillTemplate:
    name = FILL_TEMPLATES[preset]
    path = FILL_TEMPLATES_DIR / f"{name}.json"
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as error:
        raise ComfyWorkflowError(
            f"The {name} fill template is missing from this install"
        ) from error

    workflow = parse_comfy_workflow(raw, source=name)
    if (
        workflow.generates
        or workflow.mask_node is None
        or workflow.prompt_node is None
        or not workflow.seed_nodes
    ):
        raise ComfyWorkflowError(
            f"The {name} fill template lacks its input, mask, prompt or seed node"
        )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return FillTemplate(preset=preset, workflow=workflow, identity=f"{name}@{digest}")


def fill_prompt_text(instruction: str) -> str:
    text = instruction.strip() or DEFAULT_FILL_INSTRUCTION
    return FILL_PROMPT.format(instruction=text.rstrip("."))


def _loader_nodes(prompt: dict[str, Any]) -> list[tuple[str, str]]:
    return [
        (node_id, node["class_type"])
        for node_id, node in prompt.items()
        if isinstance(node, dict) and node.get("class_type") in _LOADERS
    ]


def build_fill_prompt(
    template: FillTemplate,
    *,
    image_ref: str,
    mask_ref: str,
    prompt_text: str,
    seed: int,
    filename_prefix: str,
    settings: FillSettings | None = None,
) -> dict[str, Any]:
    settings = settings or get_fill_settings()
    values: dict[str, object] = {}
    # Fast keeps the eight steps its LoRA was distilled for.
    if template.preset == "quality":
        values[STEPS_INPUT] = settings.quality_steps

    workflow = template.workflow
    prompt = build_comfy_prompt(
        workflow,
        media_ref=image_ref,
        mask_ref=mask_ref,
        filename_prefix=filename_prefix,
        seed=seed,
        prompt_text=prompt_text,
        custom_values=resolve_custom_inputs(workflow, values),
    )

    for node_id, class_type in _loader_nodes(prompt):
        key, setting, _ = _LOADERS[class_type]
        prompt[node_id]["inputs"][key] = getattr(settings, setting)
    # Fast keeps the CFG 1 its LoRA was distilled for.
    if template.preset == "quality":
        for node in prompt.values():
            if isinstance(node, dict) and node.get("class_type") == SAMPLER_CLASS:
                node["inputs"][CFG_INPUT] = settings.quality_cfg
    return prompt


def _missing_nodes_reason(missing: list[str]) -> str:
    names = ", ".join(sorted(missing))
    return f"Update ComfyUI for Qwen-Image 2.1 support: it lacks {names}."


def _preset_reason(
    template: FillTemplate,
    nodes: dict[str, dict[str, Any] | None],
    settings: FillSettings,
) -> str | None:
    classes = {
        node["class_type"]
        for node in template.workflow.prompt.values()
        if isinstance(node, dict) and isinstance(node.get("class_type"), str)
    }
    missing = [name for name in classes if nodes.get(name) is None]
    if missing:
        return _missing_nodes_reason(missing)

    for _, class_type in _loader_nodes(template.workflow.prompt):
        key, setting, folder = _LOADERS[class_type]
        wanted = getattr(settings, setting)
        info = nodes[class_type]
        options = combo_options(info, key) if info is not None else None
        if options is not None and wanted not in options:
            return (
                f'ComfyUI has no {folder} file "{wanted}". Download it, or choose another in '
                "Settings > Integrations."
            )
    return None


def describe_fill_presets(client: httpx.Client) -> list[FillPresetState]:
    """And what to install when it cannot."""
    settings = get_fill_settings()
    templates: dict[FillPreset, FillTemplate | str] = {}
    for preset in FILL_TEMPLATES:
        try:
            templates[preset] = load_fill_template(preset)
        except ComfyWorkflowError as error:
            templates[preset] = str(error)

    classes = sorted(
        {
            node["class_type"]
            for template in templates.values()
            if isinstance(template, FillTemplate)
            for node in template.workflow.prompt.values()
            if isinstance(node, dict) and isinstance(node.get("class_type"), str)
        }
    )
    nodes: dict[str, dict[str, Any] | None] = {}
    unreachable: str | None = None
    try:
        for class_type in classes:
            nodes[class_type] = fetch_node_info(client, class_type)
    except ComfyUnavailableError:
        unreachable = (
            f"ComfyUI is not reachable at {get_comfy_base_url()}. Start it, or check "
            "Settings > Integrations."
        )
    except ComfyError as error:
        unreachable = f"ComfyUI could not describe its nodes: {error}"

    states: list[FillPresetState] = []
    for preset, template in templates.items():
        if isinstance(template, str):
            reason: str | None = template
        elif unreachable is not None:
            reason = unreachable
        else:
            reason = _preset_reason(template, nodes, settings)
        states.append(FillPresetState(preset=preset, available=reason is None, reason=reason))
    return states
