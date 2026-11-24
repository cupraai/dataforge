"""ComfyUI presets: a source loader makes an edit preset; without one it generates."""

from __future__ import annotations

import json
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from comfy_settings import get_comfy_workflows_dir
from schemas import ComfyInputKind, ComfyInputValue, ComfySourceKind

WORKFLOW_EXTENSION = ".json"

MAX_WORKFLOW_BYTES = 4 * 1024 * 1024

INPUT_NODE_TITLE = "DataForge Input"
OUTPUT_NODE_TITLE = "DataForge Output"
SEED_NODE_TITLE = "DataForge Seed"
PROMPT_NODE_TITLE = "DataForge Prompt"
#: A second uploaded image: white regenerates, black keeps.
MASK_NODE_TITLE = "DataForge Mask"
#: A showcase chains its LoRAs after this node's model output; several nodes each get the chain.
MODEL_NODE_TITLE = "DataForge Model"

#: Other nodes with this prefix are custom inputs, named by the rest of the title.
CUSTOM_INPUT_TITLE_PREFIX = "DataForge "
_ROLE_TITLES = frozenset(
    {
        INPUT_NODE_TITLE,
        OUTPUT_NODE_TITLE,
        SEED_NODE_TITLE,
        PROMPT_NODE_TITLE,
        MASK_NODE_TITLE,
        MODEL_NODE_TITLE,
    }
)

#: Found without a title when the graph holds exactly one of them.
MODEL_LOADER_CLASSES = frozenset({"UNETLoader", "CheckpointLoaderSimple"})
#: The keys are also the inferrable input classes.
INPUT_KEYS = {"LoadImage": "image", "LoadImageMask": "image", "VHS_LoadVideo": "video"}
#: A mask loader never stands in for an untitled source.
INPUT_CLASSES = frozenset(INPUT_KEYS) - {"LoadImageMask"}

#: DataForge only has an uploaded name to give these.
PATH_LOADERS = frozenset({"VHS_LoadVideoPath", "VHS_LoadImagePath"})
OUTPUT_CLASSES = frozenset(
    {
        "SaveImage",
        "PreviewImage",
        "SaveImageWebsocket",
        "VHS_VideoCombine",
        "SaveVideo",
        "SaveWEBM",
        "SaveAnimatedWEBP",
        "SaveAnimatedPNG",
    }
)

# PreviewImage has no filename_prefix; its ref comes from history.
_NO_PREFIX_CLASSES = frozenset({"PreviewImage", "SaveImageWebsocket"})

INPUT_WIDGET_KEYS = ("image", "video")

#: SaveImage takes a prefix ComfyUI completes; self-writing nodes take a whole name.
OUTPUT_WIDGET_KEYS = ("filename_prefix", "filename")

#: KSampler "seed", SamplerCustom "noise_seed", Int "value".
_SEED_INPUT_KEYS = ("seed", "noise_seed", "value")

#: Seed keys for presets without a seed node; "value" is out, as an Int may be a width.
_SAMPLER_SEED_KEYS = ("seed", "noise_seed")

#: CLIPTextEncode "text", Text (Multiline) "value", Qwen encoders "prompt".
_PROMPT_INPUT_KEYS = ("text", "value", "prompt")

_KIND_NOUNS: dict[ComfyInputKind, str] = {
    "boolean": "on or off",
    "integer": "a whole number",
    "number": "a number",
    "text": "text",
}

_EXPORT_HINT = "Use Save (API Format) in ComfyUI, not the editor's Save."


class ComfyWorkflowError(Exception):
    """Its message names the fix."""


@dataclass(frozen=True)
class ComfyPreset:
    name: str
    modified_at: float
    #: None when unparseable: it still lists, and fails at queue time.
    accepts_prompt: bool | None = None
    accepts_seed: bool | None = None
    custom_inputs: tuple[ComfyCustomInput, ...] = ()
    #: True without a source loader; None when unparseable.
    generates: bool | None = None
    accepts_loras: bool | None = None
    source_kind: ComfySourceKind | None = None
    #: A showcase seeds every sampler of a source preset too.
    accepts_showcase_seed: bool | None = None


@dataclass(frozen=True)
class ComfyCustomInput:
    name: str
    node: str
    key: str
    kind: ComfyInputKind
    #: Runs when the field is left empty.
    default: ComfyInputValue


@dataclass(frozen=True)
class ComfyWorkflow:
    preset: str
    prompt: dict[str, Any]
    #: None for a generation preset.
    input_node: str | None
    input_key: str | None
    output_node: str
    #: None for a node that names nothing, such as PreviewImage.
    output_key: str | None
    seed_nodes: tuple[str, ...]
    prompt_node: str | None
    prompt_key: str | None = None
    custom_inputs: tuple[ComfyCustomInput, ...] = ()
    #: None when the workflow takes no mask.
    mask_node: str | None = None
    mask_key: str | None = None
    #: Runs when no prompt is supplied.
    saved_prompt_text: str | None = None
    #: Where a showcase's LoRAs go; empty when no model node can be told apart.
    model_nodes: tuple[str, ...] = ()

    @property
    def generates(self) -> bool:
        return self.input_node is None

    @property
    def source_kind(self) -> ComfySourceKind | None:
        if self.input_key == "image" or self.input_key == "video":
            return self.input_key
        return None


def require_source_input(workflow: ComfyWorkflow) -> None:
    if workflow.generates:
        raise ComfyWorkflowError(
            f'The preset "{workflow.preset}" has no input node, so it cannot load a file. '
            f'Title the loader you want in ComfyUI "{INPUT_NODE_TITLE}" and re-export it, or make '
            "new files with it in Run ComfyUI workflow."
        )


def require_generation(workflow: ComfyWorkflow) -> None:
    if not workflow.generates:
        raise ComfyWorkflowError(
            f'The preset "{workflow.preset}" loads a source file, so it edits files instead of '
            "making new ones. To generate from a fixed reference image, title its loader "
            f'something other than "{INPUT_NODE_TITLE}" and use a loader other than '
            f"{', '.join(sorted(INPUT_CLASSES))}."
        )


def _model_nodes(prompt: dict[str, Any]) -> tuple[str, ...]:
    titled = tuple(
        node_id for node_id, node in graph_nodes(prompt) if node_title(node) == MODEL_NODE_TITLE
    )
    if titled:
        return titled
    loaders = tuple(
        node_id
        for node_id, node in graph_nodes(prompt)
        if node["class_type"] in MODEL_LOADER_CLASSES
    )
    return loaders if len(loaders) == 1 else ()


def node_title(node: dict[str, Any]) -> str:
    meta = node.get("_meta")
    title = meta.get("title") if isinstance(meta, dict) else None
    return title.strip() if isinstance(title, str) else ""


def graph_nodes(prompt: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return [
        (node_id, node)
        for node_id, node in prompt.items()
        if isinstance(node, dict) and isinstance(node.get("class_type"), str)
    ]


def node_inputs(node: dict[str, Any]) -> dict[str, Any]:
    inputs = node.get("inputs")
    return inputs if isinstance(inputs, dict) else {}


def link_of(value: object) -> tuple[str, int] | None:
    """The node and output an input is linked to; None for a literal."""
    if isinstance(value, list) and len(value) == 2 and isinstance(value[1], int):
        return str(value[0]), value[1]
    return None


def _is_editor_format(payload: object) -> bool:
    """ComfyUI's API cannot run the editor's save format."""
    return isinstance(payload, dict) and ("nodes" in payload or "last_node_id" in payload)


def _resolve_role(
    preset: str,
    prompt: dict[str, Any],
    *,
    title: str,
    classes: frozenset[str],
    role: str,
) -> str:
    titled = [node_id for node_id, node in graph_nodes(prompt) if node_title(node) == title]
    if len(titled) == 1:
        return titled[0]
    if len(titled) > 1:
        raise ComfyWorkflowError(
            f'The preset "{preset}" has {len(titled)} nodes titled "{title}". '
            f"Only one node can be the {role}."
        )

    matched = [node_id for node_id, node in graph_nodes(prompt) if node["class_type"] in classes]
    if len(matched) == 1:
        return matched[0]

    if not matched:
        raise ComfyWorkflowError(
            f'The preset "{preset}" has no {role} node. '
            f'Title the node you want in ComfyUI "{title}" and re-export it.'
        )

    raise ComfyWorkflowError(
        f'The preset "{preset}" has {len(matched)} {role} nodes and none is titled "{title}". '
        f"Title the one to use and re-export it."
    )


def _optional_titled_node(prompt: dict[str, Any], title: str) -> str | None:
    titled = [node_id for node_id, node in graph_nodes(prompt) if node_title(node) == title]
    return titled[0] if len(titled) == 1 else None


def _has_source_loader(prompt: dict[str, Any]) -> bool:
    """Any loader that could stand in for an input makes this an edit preset."""
    return any(
        node_title(node) == INPUT_NODE_TITLE or node["class_type"] in INPUT_CLASSES
        for _, node in graph_nodes(prompt)
    )


def _numeric_key(node: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    """A linked input is a list and must not match."""
    inputs = node_inputs(node)
    for key in keys:
        if isinstance(inputs.get(key), int | float):
            return key
    return None


def prompt_input_key(node: dict[str, Any]) -> str | None:
    """A linked input is a list and must not match."""
    inputs = node_inputs(node)
    for key in _PROMPT_INPUT_KEYS:
        if isinstance(inputs.get(key), str):
            return key
    return None


def _seed_key(node: dict[str, Any]) -> str | None:
    return _numeric_key(node, _SEED_INPUT_KEYS)


def sampler_seed_nodes(prompt: dict[str, Any]) -> tuple[str, ...]:
    """Left alone, a generation run repeats one image."""
    return tuple(
        node_id
        for node_id, node in graph_nodes(prompt)
        if _numeric_key(node, _SAMPLER_SEED_KEYS) is not None
    )


def _input_widget_key(node: dict[str, Any]) -> str | None:
    inputs = node_inputs(node)
    known = INPUT_KEYS.get(node["class_type"])
    if known is not None:
        return known if isinstance(inputs.get(known), str) else None
    for key in INPUT_WIDGET_KEYS:
        if isinstance(inputs.get(key), str):
            return key
    return None


def _output_widget_key(node: dict[str, Any]) -> str | None:
    inputs = node_inputs(node)
    for key in OUTPUT_WIDGET_KEYS:
        if isinstance(inputs.get(key), str):
            return key
    return None


def _custom_input_key(node: dict[str, Any]) -> str | None:
    """``value``, else the node's only literal scalar."""
    inputs = node_inputs(node)
    literals = [key for key, value in inputs.items() if isinstance(value, bool | int | float | str)]
    if "value" in literals:
        return "value"
    return literals[0] if len(literals) == 1 else None


def _custom_input_kind(node: dict[str, Any], value: ComfyInputValue) -> ComfyInputKind:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str):
        return "text"
    # The editor exports 24.0 as 24, so the class has to say "float".
    if isinstance(value, float) or "float" in node["class_type"].lower():
        return "number"
    return "integer"


def _custom_inputs(payload: dict[str, Any], source: str) -> tuple[ComfyCustomInput, ...]:
    titled: dict[str, list[str]] = {}
    for node_id, node in graph_nodes(payload):
        title = node_title(node)
        if title.startswith(CUSTOM_INPUT_TITLE_PREFIX) and title not in _ROLE_TITLES:
            name = title.removeprefix(CUSTOM_INPUT_TITLE_PREFIX).strip()
            if name:
                titled.setdefault(name, []).append(node_id)

    found: list[ComfyCustomInput] = []
    for name, node_ids in sorted(titled.items(), key=lambda item: item[0].lower()):
        # Ambiguous means no input, not a guess.
        if len(node_ids) > 1:
            continue
        node = payload[node_ids[0]]
        key = _custom_input_key(node)
        if key is None:
            raise ComfyWorkflowError(
                f'The node titled "{CUSTOM_INPUT_TITLE_PREFIX}{name}" in preset "{source}" has no '
                "single value to write. Title a node holding its own value, such as Int, Float, "
                "String or Boolean."
            )
        default = node_inputs(node)[key]
        found.append(
            ComfyCustomInput(
                name=name,
                node=node_ids[0],
                key=key,
                kind=_custom_input_kind(node, default),
                default=default,
            )
        )
    return tuple(found)


def resolve_custom_inputs(
    workflow: ComfyWorkflow, values: Mapping[str, object]
) -> dict[str, ComfyInputValue]:
    """Refuses names the preset has no node for."""
    by_name = {entry.name: entry for entry in workflow.custom_inputs}
    resolved: dict[str, ComfyInputValue] = {}
    for name, value in values.items():
        entry = by_name.get(name)
        if entry is None:
            raise ComfyWorkflowError(
                f'The preset "{workflow.preset}" has no node titled '
                f'"{CUSTOM_INPUT_TITLE_PREFIX}{name}". Re-open the dialog to see its inputs.'
            )
        resolved[name] = _coerce_custom_value(entry, value)
    return resolved


def _coerce_custom_value(entry: ComfyCustomInput, value: object) -> ComfyInputValue:
    # bool is an int subclass, so it is ruled out first.
    if entry.kind == "boolean" and isinstance(value, bool):
        return value
    if entry.kind == "text" and isinstance(value, str):
        return value
    if entry.kind == "integer" and isinstance(value, int) and not isinstance(value, bool):
        return value
    if entry.kind == "number" and isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    raise ComfyWorkflowError(f'"{entry.name}" must be {_KIND_NOUNS[entry.kind]}, not {value!r}.')


def parse_comfy_workflow(raw: str, *, source: str) -> ComfyWorkflow:
    if len(raw.encode("utf-8")) > MAX_WORKFLOW_BYTES:
        raise ComfyWorkflowError(f'The preset "{source}" is too large to be a workflow.')

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ComfyWorkflowError(f'The preset "{source}" is not valid JSON: {error}') from error

    if _is_editor_format(payload):
        raise ComfyWorkflowError(
            f'The preset "{source}" is an editor workflow, not an API-format one. {_EXPORT_HINT}'
        )

    if not isinstance(payload, dict) or not graph_nodes(payload):
        raise ComfyWorkflowError(f'The preset "{source}" holds no ComfyUI nodes. {_EXPORT_HINT}')

    for _, node in graph_nodes(payload):
        if node["class_type"] in PATH_LOADERS:
            raise ComfyWorkflowError(
                f'The preset "{source}" loads from a filesystem path. DataForge uploads the '
                "file instead, so title an upload loader such as VHS_LoadVideo."
            )
        if node["class_type"] == "VHS_BatchManager":
            raise ComfyWorkflowError(
                f'The preset "{source}" uses unsupported VHS batch-manager continuations. '
                "Remove the batch manager and process a shorter clip, or use a workflow "
                "that chunks frames within one prompt."
            )

    input_node: str | None = None
    input_key: str | None = None
    if _has_source_loader(payload):
        input_node = _resolve_role(
            source, payload, title=INPUT_NODE_TITLE, classes=INPUT_CLASSES, role="input"
        )
        input_key = _input_widget_key(payload[input_node])
        if input_key is None:
            keys = " or ".join(repr(key) for key in INPUT_WIDGET_KEYS)
            raise ComfyWorkflowError(
                f'The input node of preset "{source}" takes no filename under {keys}. '
                f"Title a loading node {INPUT_NODE_TITLE!r} instead."
            )

    output_node = _resolve_role(
        source, payload, title=OUTPUT_NODE_TITLE, classes=OUTPUT_CLASSES, role="output"
    )

    output_class = payload[output_node]["class_type"]
    output_key = _output_widget_key(payload[output_node])
    if output_class not in _NO_PREFIX_CLASSES and output_key is None:
        keys = " or ".join(repr(key) for key in OUTPUT_WIDGET_KEYS)
        raise ComfyWorkflowError(
            f'The output node of preset "{source}" names what it writes under neither {keys}. '
            f"Title a saving node {OUTPUT_NODE_TITLE!r} instead."
        )

    seed_node = _optional_titled_node(payload, SEED_NODE_TITLE)
    if seed_node is not None and _seed_key(payload[seed_node]) is None:
        keys = ", ".join(repr(key) for key in _SEED_INPUT_KEYS)
        raise ComfyWorkflowError(
            f'The node titled "{SEED_NODE_TITLE}" in preset "{source}" has no seed input. '
            f"Title a node holding its own number under one of {keys}, such as KSampler or Int."
        )
    if seed_node is not None:
        seed_nodes: tuple[str, ...] = (seed_node,)
    elif input_node is None:
        seed_nodes = sampler_seed_nodes(payload)
    else:
        seed_nodes = ()

    prompt_node = _optional_titled_node(payload, PROMPT_NODE_TITLE)
    prompt_key = prompt_input_key(payload[prompt_node]) if prompt_node else None
    if prompt_node is not None and prompt_key is None:
        keys = ", ".join(repr(key) for key in _PROMPT_INPUT_KEYS)
        raise ComfyWorkflowError(
            f'The node titled "{PROMPT_NODE_TITLE}" in preset "{source}" has no text input to '
            f"write. Title a node holding its own prompt text under one of {keys}, such as "
            f"CLIPTextEncode or Text (Multiline)."
        )

    mask_node = _optional_titled_node(payload, MASK_NODE_TITLE)
    mask_key = _input_widget_key(payload[mask_node]) if mask_node else None
    if mask_node is not None and mask_key is None:
        raise ComfyWorkflowError(
            f'The node titled "{MASK_NODE_TITLE}" in preset "{source}" takes no filename. '
            "Title an image loader such as LoadImageMask instead."
        )

    return ComfyWorkflow(
        preset=source,
        prompt=payload,
        input_node=input_node,
        input_key=input_key,
        output_node=output_node,
        output_key=output_key,
        seed_nodes=seed_nodes,
        prompt_node=prompt_node,
        prompt_key=prompt_key,
        saved_prompt_text=(
            payload[prompt_node]["inputs"][prompt_key] if prompt_node and prompt_key else None
        ),
        custom_inputs=_custom_inputs(payload, source),
        mask_node=mask_node,
        mask_key=mask_key,
        model_nodes=_model_nodes(payload),
    )


def showcase_seed_nodes(workflow: ComfyWorkflow) -> tuple[str, ...]:
    """A showcase item is a generation even when it starts from an image."""
    return workflow.seed_nodes or sampler_seed_nodes(workflow.prompt)


def _preset_path(name: str) -> Path:
    """Refuses anything that is not a plain name."""
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise ComfyWorkflowError("Choose a workflow preset to run.")
    return get_comfy_workflows_dir() / f"{name}{WORKFLOW_EXTENSION}"


def _parse_preset_file(path: Path) -> ComfyWorkflow | None:
    """Never raises: a broken preset still lists, and queueing it names the fix."""
    try:
        if path.stat().st_size > MAX_WORKFLOW_BYTES:
            return None
        return parse_comfy_workflow(path.read_text(encoding="utf-8"), source=path.stem)
    except (ComfyWorkflowError, OSError, UnicodeDecodeError, ValueError):
        return None


def list_comfy_presets() -> list[ComfyPreset]:
    folder = get_comfy_workflows_dir()
    presets: list[ComfyPreset] = []

    try:
        entries = sorted(folder.glob(f"*{WORKFLOW_EXTENSION}"))
    except OSError:
        return []

    for path in entries:
        try:
            stat = path.stat()
        except OSError:
            continue
        if not path.is_file():
            continue
        workflow = _parse_preset_file(path)
        presets.append(
            ComfyPreset(
                name=path.stem,
                modified_at=stat.st_mtime,
                accepts_prompt=None if workflow is None else workflow.prompt_node is not None,
                accepts_seed=None if workflow is None else bool(workflow.seed_nodes),
                custom_inputs=() if workflow is None else workflow.custom_inputs,
                generates=None if workflow is None else workflow.generates,
                accepts_loras=None if workflow is None else bool(workflow.model_nodes),
                source_kind=None if workflow is None else workflow.source_kind,
                accepts_showcase_seed=(
                    None if workflow is None else bool(showcase_seed_nodes(workflow))
                ),
            )
        )

    presets.sort(key=lambda preset: preset.name.lower())
    return presets


def comfy_presets_fingerprint() -> str:
    """Moves when a preset is added, removed, renamed or written again."""
    parts: list[str] = []
    for path in get_comfy_workflows_dir().glob(f"*{WORKFLOW_EXTENSION}"):
        try:
            # A directory entry's own times lag behind on Windows.
            stat = path.stat()
        except OSError:
            continue
        parts.append(f"{path.name}|{stat.st_mtime_ns}|{stat.st_size}")
    return "\n".join(sorted(parts))


def read_comfy_preset_text(name: str) -> str:
    path = _preset_path(name)
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise ComfyWorkflowError(f'No workflow preset named "{name}".') from error


def load_comfy_workflow(name: str) -> ComfyWorkflow:
    return parse_comfy_workflow(read_comfy_preset_text(name), source=name)


def _output_name(key: str, saved: object, filename_prefix: str) -> str:
    """A prefix node takes a path ComfyUI completes; a self-writing node takes a whole name."""
    if key == "filename_prefix":
        return filename_prefix

    suffix = Path(saved).suffix if isinstance(saved, str) else ""
    return f"{filename_prefix.replace('/', '_')}{suffix}"


def build_comfy_prompt(
    workflow: ComfyWorkflow,
    *,
    media_ref: str | None,
    filename_prefix: str,
    seed: int | None = None,
    prompt_text: str | None = None,
    custom_values: Mapping[str, ComfyInputValue] | None = None,
    mask_ref: str | None = None,
) -> dict[str, Any]:
    """``media_ref`` is None exactly when the preset generates."""
    prompt = deepcopy(workflow.prompt)

    if workflow.input_node is None or workflow.input_key is None:
        if media_ref is not None:
            require_source_input(workflow)
    else:
        if media_ref is None:
            require_generation(workflow)
        prompt[workflow.input_node]["inputs"][workflow.input_key] = media_ref

    if mask_ref is not None:
        if workflow.mask_node is None or workflow.mask_key is None:
            raise ComfyWorkflowError(
                f'The preset "{workflow.preset}" has no node titled "{MASK_NODE_TITLE}" to load '
                "the mask into."
            )
        prompt[workflow.mask_node]["inputs"][workflow.mask_key] = mask_ref

    output_inputs = prompt[workflow.output_node].get("inputs")
    if isinstance(output_inputs, dict) and workflow.output_key is not None:
        output_inputs[workflow.output_key] = _output_name(
            workflow.output_key, output_inputs.get(workflow.output_key), filename_prefix
        )

    if seed is not None:
        for node_id in workflow.seed_nodes:
            key = _seed_key(prompt[node_id])
            if key is not None:
                prompt[node_id]["inputs"][key] = seed

    if (
        prompt_text is not None
        and workflow.prompt_node is not None
        and workflow.prompt_key is not None
    ):
        prompt[workflow.prompt_node]["inputs"][workflow.prompt_key] = prompt_text

    return with_custom_inputs(workflow, prompt, custom_values or {})


def with_custom_inputs(
    workflow: ComfyWorkflow,
    prompt: dict[str, Any],
    custom_values: Mapping[str, ComfyInputValue],
) -> dict[str, Any]:
    """Write each resolved custom value into its node; returns ``prompt``."""
    for entry in workflow.custom_inputs:
        if entry.name in custom_values:
            prompt[entry.node]["inputs"][entry.key] = custom_values[entry.name]
    return prompt
