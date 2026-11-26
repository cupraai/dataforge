from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, replace
from pathlib import Path

from comfy_computed import math_expression, math_expression_output, resolution_selector
from comfy_editor_graph import EditorNode, flatten_editor_graph
from comfy_embedded_generation import embedded_generation, generation_workflow
from comfy_metadata import read_media_metadata_values
from comfy_switches import BOOLEAN_SWITCHES, INDEXED_INPUT, INDEXED_SWITCHES
from external.comfy_workflows import ComfyWorkflow, ComfyWorkflowError
from media_dimensions import media_dimensions
from schemas import ComfyMapNodeKind, ComfyMediaKind, ComfyPassStatus, ComfyPromptRole

_MAX_VALUE_HOPS = 12
_MAX_PROMPT_CHARS = 20000

_SAVE_CLASS_MARKERS = ("save", "videocombine", "output")
_PREVIEW_CLASS_MARKERS = ("preview",)
_MEDIA_INPUTS = frozenset({"images", "image", "video", "audio"})
#: Classes that write their own file without a save marker in the name.
_EXTRA_OUTPUT_CLASSES = frozenset({"swiftvrrestorevideo"})

_POSITIVE_INPUT_NAMES = frozenset(
    {"text", "prompt", "positive", "positive_prompt", "text_g", "text_l", "caption", "string"}
)
_NEGATIVE_INPUT_NAMES = frozenset({"negative", "negative_prompt", "text_negative"})
_PROMPT_INPUT_NAMES = _POSITIVE_INPUT_NAMES | _NEGATIVE_INPUT_NAMES
_SLOT_INPUT_NAMES = frozenset({"positive", "positive_prompt"}) | _NEGATIVE_INPUT_NAMES

_STRING_PASSTHROUGH_INPUTS = ("_source", "value", "string", "text", "string_a", "text_a", "prompt")

_SCALAR_INPUT_KEYS = {
    "PrimitiveInt": "value",
    "PrimitiveFloat": "value",
    "PrimitiveBoolean": "value",
    "PrimitiveString": "value",
    "PrimitiveStringMultiline": "value",
    "INTConstant": "value",
    "FloatConstant": "value",
    "BOOLConstant": "value",
    "StringConstant": "string",
}

_ROUTE_CLASSES = frozenset({"GetNode", "SetNode", "Reroute"})
_RESOLUTION_INPUT_KEYS = ("aspect_ratio", "megapixels", "multiple")
#: These re-sample the image their own stage made.
_REFINER_CLASS_MARKERS = ("detailer", "ultimatesdupscale")
_NAME_INPUT_KEYS = ("filename_prefix", "filename")
#: Switched off, VHS's combine writes to the temp folder, as a preview does.
_SAVE_FLAG_INPUTS = ("save_output",)
#: Sampler nodes such as SamplerLCM, whose class names the sampler.
_SAMPLER_OBJECT_PREFIX = "Sampler"
#: Where a class name's words meet; `DPMPP_2M` already has `_`.
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")

type ScalarValue = str | int | float | bool

_PARAMETER_LABELS: dict[str, str] = {
    "ckpt_name": "Checkpoint",
    "unet_name": "Model",
    "model_name": "Model",
    "vae_name": "VAE",
    "clip_name": "CLIP",
    "seed": "Seed",
    "noise_seed": "Seed",
    "steps": "Steps",
    "cfg": "CFG",
    "guidance": "Guidance",
    "denoise": "Denoise",
    "sampler_name": "Sampler",
    "scheduler": "Scheduler",
    "width": "Width",
    "height": "Height",
    "aspect_ratio": "Aspect ratio",
    "megapixels": "Megapixels",
    "length": "Frames",
    "frame_rate": "Frame rate",
}


@dataclass(frozen=True)
class PromptText:
    role: ComfyPromptRole
    text: str
    node_id: str
    node_title: str | None
    input_name: str


@dataclass(frozen=True)
class Parameter:
    label: str
    value: str


@dataclass(frozen=True)
class SamplingStage:
    node_id: str
    label: str
    group: str | None
    status: ComfyPassStatus
    parameters: list[Parameter]
    loras: list[str]


@dataclass(frozen=True)
class SharedSettings:
    #: The passes that read these settings, earliest first.
    passes: list[str]
    parameters: list[Parameter]
    loras: list[str]


@dataclass(frozen=True)
class MapNode:
    id: str
    kind: ComfyMapNodeKind
    label: str
    #: The full text behind a short label.
    detail: list[str]
    status: ComfyPassStatus
    feeds: list[str]
    role: ComfyPromptRole | None = None
    media: ComfyMediaKind | None = None


@dataclass
class OutputBranch:
    node_id: str
    class_type: str
    label: str
    filename_prefix: str | None
    filename: str | None
    is_preview: bool
    matches_filename: bool
    prompts: list[PromptText] = field(default_factory=list)
    #: With `stages`, only the settings read after sampling, on the way to the output.
    parameters: list[Parameter] = field(default_factory=list)
    loras: list[str] = field(default_factory=list)
    #: Empty when the output has one pass and it ran.
    stages: list[SamplingStage] = field(default_factory=list)
    #: Settings several passes read, one entry per set of passes.
    shared: list[SharedSettings] = field(default_factory=list)
    #: The passes and what feeds them, earliest first; empty when nothing samples.
    map: list[MapNode] = field(default_factory=list)
    #: For telling same-named outputs apart.
    widths: frozenset[int] = frozenset()
    heights: frozenset[int] = frozenset()
    #: None when it loads a source file or cannot parse.
    generation: ComfyWorkflow | None = None


@dataclass
class WorkflowPrompts:
    has_workflow: bool
    source: str
    branches: list[OutputBranch]
    matched_node_id: str | None
    orphan_prompts: list[PromptText]
    has_editor_workflow: bool = False
    #: Only the matched output renders at the file's size.
    matched_by_size: bool = False


def _link_reference(value: object) -> tuple[str, int] | None:
    if (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], (str, int))
        and isinstance(value[1], int)
        and not isinstance(value[1], bool)
        and value[1] >= 0
    ):
        return str(value[0]), value[1]
    return None


def _link_target(value: object) -> str | None:
    reference = _link_reference(value)
    return reference[0] if reference else None


def _node_inputs(node: object) -> dict[str, object]:
    if not isinstance(node, dict):
        return {}
    inputs = node.get("inputs")
    return inputs if isinstance(inputs, dict) else {}


def _node_class(node: object) -> str:
    if not isinstance(node, dict):
        return ""
    class_type = node.get("class_type")
    return class_type if isinstance(class_type, str) else ""


def _node_title(node: object) -> str | None:
    if not isinstance(node, dict):
        return None
    meta = node.get("_meta")
    if isinstance(meta, dict):
        title = meta.get("title")
        if isinstance(title, str) and title.strip():
            return title.strip()
    return None


def _ancestors(graph: dict[str, dict], root: str) -> list[str]:
    seen = {root}
    order = [root]
    queue = [root]
    while queue:
        current = queue.pop(0)
        for value in _node_inputs(graph.get(current)).values():
            source = _link_target(value)
            if source is None or source in seen or source not in graph:
                continue
            seen.add(source)
            order.append(source)
            queue.append(source)
    return order


def _generation_stages(
    graph: dict[str, dict], outputs: set[str]
) -> tuple[set[str], set[str], set[str]]:
    """Samplers, generators, and nodes that only carry an earlier sampler's result on."""
    samplers = {
        node_id
        for node_id, node in graph.items()
        if "latent_image" in _node_inputs(node) or _node_class(node).lower().endswith("sampler")
    }
    generators = samplers | {
        node_id
        for node_id, node in graph.items()
        if any(
            key.lower() in _PROMPT_INPUT_NAMES and _text_at(graph, node_id, value) is not None
            for key, value in _node_inputs(node).items()
        )
    }
    # A save node with a caption input writes text.
    generators -= {
        node_id
        for node_id in generators
        if node_id in outputs
        or any(marker in _node_class(graph[node_id]).lower() for marker in _REFINER_CLASS_MARKERS)
    }

    sources: dict[str, set[str]] = {
        node_id: {
            source
            for value in _node_inputs(node).values()
            if (source := _link_target(value)) is not None and source in graph
        }
        for node_id, node in graph.items()
    }
    consumers: dict[str, list[str]] = {}
    for node_id, linked in sources.items():
        for source in linked:
            consumers.setdefault(source, []).append(node_id)
    sampled = set(samplers)
    queue = list(samplers)
    while queue:
        for consumer in consumers.get(queue.pop(), []):
            if consumer not in sampled:
                sampled.add(consumer)
                queue.append(consumer)

    results = {
        node_id
        for node_id in sampled - generators
        if all(source in sampled or not sources[source] for source in sources[node_id])
    }
    return samplers, generators, results


def _stage_ancestors(
    graph: dict[str, dict], root: str, stages: tuple[set[str], set[str], set[str]]
) -> list[str]:
    """Ancestors up to the nearest generation stage, excluding earlier stages' results."""
    samplers, generators, results = stages
    order = [root]
    visited = {(root, False)}
    queue = [(root, False)]
    while queue:
        current, crossed = queue.pop(0)
        crossed = crossed or current in generators
        for value in _node_inputs(graph.get(current)).values():
            source = _link_target(value)
            if source is None or source not in graph:
                continue
            if crossed and (source in samplers or source in results):
                continue
            # An uncrossed visit explores everything a crossed one would.
            if (source, crossed) in visited or (source, False) in visited:
                continue
            if (source, True) not in visited:
                order.append(source)
            visited.add((source, crossed))
            queue.append((source, crossed))
    return order


def _skipped_inputs(graph: dict[str, dict], node: object) -> set[str]:
    """None when the selector cannot be read."""
    inputs = _node_inputs(node)
    class_type = _node_class(node)
    if class_type in BOOLEAN_SWITCHES:
        selector, when_true, when_false = BOOLEAN_SWITCHES[class_type]
        chosen = _scalar_at(graph, inputs.get(selector))
        if isinstance(chosen, bool):
            return {when_false if chosen else when_true}
    elif class_type in INDEXED_SWITCHES:
        chosen = _scalar_at(graph, inputs.get("select"))
        if isinstance(chosen, int) and not isinstance(chosen, bool):
            return {
                key for key in inputs if INDEXED_INPUT.fullmatch(key) and key != f"input{chosen}"
            }
    return set()


def _live_nodes(graph: dict[str, dict], root: str) -> set[str]:
    """Reachable without passing a switch's unselected input."""
    live = {root}
    queue = [root]
    while queue:
        node = graph.get(queue.pop())
        skipped = _skipped_inputs(graph, node)
        for key, value in _node_inputs(node).items():
            source = _link_target(value)
            if key in skipped or source is None or source in live or source not in graph:
                continue
            live.add(source)
            queue.append(source)
    return live


def _is_sampling_node(node: object) -> bool:
    """Refiners and upscalers included."""
    lowered = _node_class(node).lower()
    keys = _node_inputs(node).keys()
    return (
        "latent_image" in keys
        or lowered.endswith("sampler")
        or any(marker in lowered for marker in _REFINER_CLASS_MARKERS)
        or {"sampler", "sigmas"} <= keys
        or {"steps", "sampler_name"} <= keys
    )


def _stand_in(entry: EditorNode) -> dict:
    """So its settings read like any other's."""
    inputs: dict[str, object] = {**entry.widgets, **entry.values}
    inputs.update({name: [source, slot] for name, (source, slot) in entry.links.items()})
    return {
        "class_type": entry.class_type,
        "inputs": inputs,
        "_meta": {"title": entry.title} if entry.title else {},
    }


def _linked_inputs(
    graph: dict[str, dict], editor: dict[str, EditorNode], node_id: str
) -> list[tuple[str, str]]:
    """Both graphs: the prompt links around a bypassed node the editor still has."""
    linked = [
        (name, source)
        for name, value in _node_inputs(graph.get(node_id)).items()
        if (source := _link_target(value)) is not None
    ]
    entry = editor.get(node_id)
    return (
        linked + [(name, source) for name, (source, _) in entry.links.items()] if entry else linked
    )


def _sources(graph: dict[str, dict], editor: dict[str, EditorNode], node_id: str) -> list[str]:
    return [source for _, source in _linked_inputs(graph, editor, node_id)]


def _bypassed_on_path(
    graph: dict[str, dict], editor: dict[str, EditorNode], root: str, members: set[str]
) -> list[str]:
    """Bypassed editor nodes the output's stage runs through, nearest first."""
    found: list[str] = []
    seen = {root}
    queue = [root]
    while queue:
        for source in _sources(graph, editor, queue.pop(0)):
            if source in seen:
                continue
            entry = editor.get(source)
            if entry is not None and entry.bypassed:
                found.append(source)
            elif source not in members:
                continue
            seen.add(source)
            queue.append(source)
    return found


def _pass_region(
    graph: dict[str, dict], stage: str, members: set[str], stage_ids: set[str]
) -> set[str]:
    """Up to but excluding any other pass."""
    region = {stage}
    queue = [stage]
    while queue:
        for value in _node_inputs(graph.get(queue.pop())).values():
            source = _link_target(value)
            if source in members and source not in region and source not in stage_ids:
                region.add(source)
                queue.append(source)
    return region


def _earliest_first(ids: list[str], reads: dict[str, set[str]]) -> list[str]:
    """``ids`` ordered after what each reads; ties keep the given order."""
    ordered: list[str] = []
    while len(ordered) < len(ids):
        placed = set(ordered)
        waiting = [node_id for node_id in ids if node_id not in placed]
        ordered.append(
            next((node_id for node_id in waiting if reads[node_id] <= placed), waiting[0])
        )
    return ordered


def _pass_status(stage: str, live: set[str], bypassed: set[str]) -> ComfyPassStatus:
    if stage in bypassed:
        return "bypassed"
    return "ran" if stage in live else "switched_off"


def _split_by_pass(
    graph: dict[str, dict],
    ancestry: list[str],
    bypassed: list[str],
    live: set[str],
    editor: dict[str, EditorNode],
    subgraph_labels: dict[str, str],
) -> tuple[list[str], list[SharedSettings], list[SamplingStage]]:
    """Nodes read after sampling, nodes several passes read grouped by them, and each pass's."""
    members = ancestry + bypassed
    stage_ids = [step for step in members if _is_sampling_node(graph.get(step))]
    if len(stage_ids) < 2 and all(stage in live for stage in stage_ids):
        return [step for step in ancestry if step in live], [], []

    member_set = set(members)
    stage_set = set(stage_ids)
    holders: dict[str, list[str]] = {}
    for stage in stage_ids:
        for step in _pass_region(graph, stage, member_set, stage_set):
            holders.setdefault(step, []).append(stage)

    def owner(step: str) -> str | None:
        found = holders.get(step, [])
        if len(found) == 1 and (found[0] in live) == (step in live):
            return found[0]
        return None

    def nearest_passes(target: str) -> set[str]:
        """The passes a node reads with none in between; not bounded by the branch."""
        found: set[str] = set()
        seen = {target}
        queue = [target]
        while queue:
            for source in _sources(graph, editor, queue.pop()):
                if source in seen:
                    continue
                seen.add(source)
                if source in stage_set:
                    found.add(source)
                else:
                    queue.append(source)
        return found

    bypassed_set = set(bypassed)
    reads = {stage: nearest_passes(stage) for stage in stage_ids}
    order = _earliest_first(stage_ids, reads)
    stages: list[SamplingStage] = []
    for stage in order:
        parameters, loras = _collect_parameters(
            graph, [step for step in members if owner(step) == stage]
        )
        instance = stage.rpartition(":")[0]
        stages.append(
            SamplingStage(
                node_id=stage,
                label=_node_title(graph[stage]) or _node_class(graph[stage]),
                group=subgraph_labels.get(instance) if instance else None,
                status=_pass_status(stage, live, bypassed_set),
                parameters=parameters,
                loras=loras,
            )
        )
    # Grouped by the passes reading them, so two passes' models never share one list.
    position = {stage: index for index, stage in enumerate(order)}
    after_sampling: list[str] = []
    readers: dict[tuple[str, ...], list[str]] = {}
    for step in ancestry:
        if step not in live or owner(step) is not None:
            continue
        found = holders.get(step, [])
        if len(found) < 2:
            after_sampling.append(step)
        else:
            readers.setdefault(tuple(sorted(found, key=position.__getitem__)), []).append(step)
    shared: list[SharedSettings] = []
    for passes in sorted(readers, key=lambda key: (position[key[0]], -len(key))):
        parameters, loras = _collect_parameters(graph, readers[passes])
        if parameters or loras:
            shared.append(SharedSettings(list(passes), parameters, loras))
    return after_sampling, shared, stages


_MODEL_FILE_KEYS = ("ckpt_name", "unet_name")
#: CLIPLoader's `clip_name` and the multi-loaders' numbered inputs.
_CLIP_FILE_KEY = re.compile(r"clip_name\d*")
#: Several loaders of the same file are one box.
_TWIN_KINDS: frozenset[ComfyMapNodeKind] = frozenset({"model", "clip", "vae"})
_INPUT_MEDIA_KEYS: tuple[ComfyMediaKind, ...] = ("image", "video", "audio")
#: Left-to-right order of sources in a row.
_MAP_KIND_ORDER: dict[ComfyMapNodeKind, int] = {
    "model": 0,
    "loras": 1,
    "clip": 2,
    "vae": 3,
    "input": 4,
    "prompt": 5,
    "pass": 6,
    "output": 7,
}


def _short_name(path: str) -> str:
    """For a box too small for the path."""
    name = re.split(r"[\\/]", path.strip())[-1]
    return name.rsplit(".", 1)[0] if "." in name else name


def _map_box(
    graph: dict[str, dict], node_id: str
) -> tuple[ComfyMapNodeKind, str, list[str]] | None:
    """None for a node the map walks through."""
    node = graph.get(node_id)
    if _is_sampling_node(node):
        return "pass", _node_title(node) or _node_class(node), []
    inputs = _node_inputs(node)
    for key in _MODEL_FILE_KEYS:
        model = _scalar_at(graph, inputs.get(key))
        if isinstance(model, str) and model.strip():
            return "model", _short_name(model), [model.strip()]
    vae = _scalar_at(graph, inputs.get("vae_name"))
    if isinstance(vae, str) and vae.strip():
        return "vae", _short_name(vae), [vae.strip()]
    clips = [
        clip.strip()
        for key in sorted(inputs)
        if _CLIP_FILE_KEY.fullmatch(key)
        and isinstance(clip := _scalar_at(graph, inputs[key]), str)
        and clip.strip()
    ]
    if clips:
        return "clip", " + ".join(_short_name(clip) for clip in clips), clips
    _, loras = _collect_parameters(graph, [node_id])
    if loras:
        return "loras", "", loras
    if "load" in _node_class(node).lower() and (media := _loaded_media(node)):
        file = str(inputs[media]).strip()
        return "input", _short_name(file), [file]
    return None


def _loaded_media(node: object) -> ComfyMediaKind | None:
    inputs = _node_inputs(node)
    return next(
        (
            key
            for key in _INPUT_MEDIA_KEYS
            if isinstance(value := inputs.get(key), str) and value.strip()
        ),
        None,
    )


def _output_media(node: object) -> ComfyMediaKind:
    """By class first, since a video combine takes ``images``."""
    lowered = _node_class(node).lower()
    if "audio" in lowered:
        return "audio"
    if any(marker in lowered for marker in ("video", "animated")):
        return "video"
    inputs = _node_inputs(node).keys()
    if "video" in inputs:
        return "video"
    return "audio" if "audio" in inputs and not {"image", "images"} & inputs else "image"


def _prompt_box_id(prompt: PromptText) -> str:
    return f"prompt:{prompt.node_id}:{prompt.input_name}"


def _prompt_box_text(text: str) -> tuple[str, list[str]]:
    """The label and the tooltip text."""
    return " ".join(text.split())[:80], [text[:500]]


def _branch_map(
    graph: dict[str, dict],
    editor: dict[str, EditorNode],
    root: str,
    members: list[str],
    live: set[str],
    bypassed: set[str],
    prompts: list[PromptText],
    *,
    passless: bool = False,
) -> list[MapNode]:
    """The output's passes and what feeds them; LoRA chains and twin loaders become one box."""
    boxes = {step: box for step in members if step != root and (box := _map_box(graph, step))}
    has_pass = any(kind == "pass" for kind, _, _ in boxes.values())
    if not has_pass and not passless:
        return []
    prompt_ids: dict[str, list[str]] = {}
    for prompt in prompts:
        prompt_ids.setdefault(prompt.node_id, []).append(_prompt_box_id(prompt))

    edges: set[tuple[str, str]] = set()
    walkers = [step for step, box in boxes.items() if box[0] in ("pass", "loras")]
    for target in [root, *walkers]:
        edges.update((prompt_id, target) for prompt_id in prompt_ids.get(target, []))
        seen = {target}
        queue = [target]
        while queue:
            for source in _sources(graph, editor, queue.pop()):
                if source in seen:
                    continue
                seen.add(source)
                edges.update((prompt_id, target) for prompt_id in prompt_ids.get(source, []))
                if source in boxes:
                    # A checkpoint's VAE is no flow; without a pass the model is.
                    if not has_pass or not (boxes[source][0] == "model" and target == root):
                        edges.add((source, target))
                    continue
                queue.append(source)

    def status(step: str) -> ComfyPassStatus:
        return _pass_status(step, live, bypassed)

    # Loaders are sources, never targets.
    first: dict[tuple[str, ...], str] = {}
    twin = {
        step: first.setdefault((kind, status(step), *detail), step)
        for step, (kind, _, detail) in boxes.items()
        if kind in _TWIN_KINDS
    }
    edges = {(twin.get(source, source), target) for source, target in edges}

    # Chained LoRA loaders become one box.
    group = {step: step for step, box in boxes.items() if box[0] == "loras"}

    def head(step: str) -> str:
        while group.get(step, step) != step:
            step = group[step]
        return step

    for source, target in edges:
        if source in group and target in group and status(source) == status(target):
            group[head(source)] = head(target)
    edges = {(head(a), head(b)) for a, b in edges if head(a) != head(b)}

    nodes: dict[str, tuple[ComfyMapNodeKind, str, list[str], ComfyPassStatus]] = {}
    roles = {_prompt_box_id(prompt): prompt.role for prompt in prompts}
    media = {
        step: kind
        for step, box in boxes.items()
        if box[0] == "input" and (kind := _loaded_media(graph.get(step)))
    }
    for step, (kind, label, detail) in boxes.items():
        if kind == "loras":
            if head(step) != step:
                continue
            # The order the model meets them.
            chain = [member for member in reversed(members) if head(member) == step]
            detail = [lora for member in chain if member in group for lora in boxes[member][2]]
            only = _short_name(detail[0].rsplit(" (", 1)[0])
            label = only if len(detail) == 1 else f"{len(detail)} LoRAs"
        if kind == "pass" or any(step in edge for edge in edges):
            nodes[step] = (kind, label, detail, status(step))
    for prompt in prompts:
        nodes[_prompt_box_id(prompt)] = (
            "prompt",
            *_prompt_box_text(prompt.text),
            status(prompt.node_id),
        )
    nodes[root] = ("output", "Output", [], "ran")
    media[root] = _output_media(graph.get(root))

    feeds: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for source, target in edges:
        if source in nodes and target in nodes:
            feeds[source].append(target)
    reads = {
        node_id: {source for source, targets in feeds.items() if node_id in targets}
        for node_id in nodes
    }
    position = {step: index for index, step in enumerate(members)}
    prompt_nodes = {_prompt_box_id(prompt): prompt.node_id for prompt in prompts}

    def rank(node_id: str) -> tuple[int, int]:
        step = prompt_nodes.get(node_id, node_id)
        return _MAP_KIND_ORDER[nodes[node_id][0]], -position.get(step, 0)

    # So the map lays out its rows in one pass.
    ordered = _earliest_first(sorted(nodes, key=rank), reads)
    return [
        MapNode(
            id=node_id,
            kind=nodes[node_id][0],
            label=nodes[node_id][1],
            detail=nodes[node_id][2],
            status=nodes[node_id][3],
            feeds=sorted(feeds[node_id], key=ordered.index),
            role=roles.get(node_id),
            media=media.get(node_id),
        )
        for node_id in ordered
    ]


def _with_virtual_routes(graph: dict[str, dict], workflow: object) -> dict[str, dict]:
    if not isinstance(workflow, dict):
        return graph
    definitions = workflow.get("definitions")
    subgraphs = definitions.get("subgraphs", []) if isinstance(definitions, dict) else []
    definitions_by_id = {
        entry["id"]: entry
        for entry in (subgraphs if isinstance(subgraphs, list) else [])
        if isinstance(entry, dict) and isinstance(entry.get("id"), str)
    }
    resolved = graph.copy()

    def visit(scope: dict, prefix: str, inherited: dict[str, list], depth: int) -> None:
        if depth >= _MAX_VALUE_HOPS:
            return
        nodes = scope.get("nodes", [])
        nodes = (
            [node for node in nodes if isinstance(node, dict)] if isinstance(nodes, list) else []
        )
        links = scope.get("links", [])
        sources: dict[str, list] = {}
        for link in links if isinstance(links, list) else []:
            if isinstance(link, list) and len(link) >= 5:
                link_id, origin, slot = link[:3]
            elif isinstance(link, dict):
                link_id, origin, slot = (
                    link.get("id"),
                    link.get("origin_id"),
                    link.get("origin_slot"),
                )
            else:
                continue
            if isinstance(origin, (str, int)) and _link_reference([origin, slot]):
                sources[str(link_id)] = [f"{prefix}{origin}", slot]

        local: dict[str, list] = {}
        routes: dict[str, list] = {}
        for node in nodes:
            if node.get("type") != "SetNode":
                continue
            widgets = node.get("widgets_values")
            if not isinstance(widgets, list) or not widgets or not isinstance(widgets[0], str):
                continue
            inputs = node.get("inputs")
            source = None
            if isinstance(inputs, list) and inputs and isinstance(inputs[0], dict):
                source = sources.get(str(inputs[0].get("link")))
            local.setdefault(widgets[0], []).append(source)
            if source is not None:
                routes[str(node.get("id"))] = source

        setters = {**inherited, **local}
        for node in nodes:
            node_type = node.get("type")
            node_id = str(node.get("id"))
            if node_type == "GetNode":
                widgets = node.get("widgets_values")
                name = widgets[0] if isinstance(widgets, list) and widgets else None
                candidates = setters.get(name, []) if isinstance(name, str) and name else []
                if len(candidates) == 1 and candidates[0] is not None:
                    routes[node_id] = candidates[0]
            if node_id in routes:
                identifier = f"{prefix}{node_id}"
                existing = graph.get(identifier)
                # Editor metadata only supplies missing virtual routing.
                if existing is None or _node_class(existing) == node_type:
                    resolved[identifier] = {
                        **(existing or {}),
                        "class_type": node_type,
                        "inputs": {"_source": routes[node_id], **_node_inputs(existing)},
                    }
            definition = definitions_by_id.get(node_type) if isinstance(node_type, str) else None
            child_prefix = f"{prefix}{node_id}:"
            if definition and any(identifier.startswith(child_prefix) for identifier in graph):
                visit(definition, child_prefix, setters, depth + 1)

    visit(workflow, "", {}, 0)
    return resolved


def _forwarded_input(node: object) -> object | None:
    """The input a constant or route node passes on unchanged; None for any other."""
    inputs = _node_inputs(node)
    class_type = _node_class(node)
    key = _SCALAR_INPUT_KEYS.get(class_type)
    if key is not None:
        return inputs.get(key)
    if class_type in _ROUTE_CLASSES:
        if "_source" in inputs:
            return inputs["_source"]
        if class_type == "Reroute" and len(inputs) == 1:
            return next(iter(inputs.values()))
    return None


def _computed_output(
    graph: dict[str, dict], node: object, slot: int, hops: int
) -> ScalarValue | None:
    inputs = _node_inputs(node)
    class_type = _node_class(node)
    if class_type == "ResolutionSelector" and slot in (0, 1):
        size = resolution_selector(
            *(_scalar_at(graph, inputs.get(key), hops + 1) for key in _RESOLUTION_INPUT_KEYS)
        )
        return size[slot] if size else None
    if class_type == "ComfyMathExpression":
        values = {
            key.removeprefix("values."): _scalar_at(graph, value, hops + 1)
            for key, value in inputs.items()
            if key.startswith("values.")
        }
        if any(value is None for value in values.values()):
            return None
        result = math_expression(_scalar_at(graph, inputs.get("expression"), hops + 1), values)
        return math_expression_output(result, slot) if result is not None else None
    return None


def _scalar_at(graph: dict[str, dict], value: object, hops: int = 0) -> ScalarValue | None:
    if isinstance(value, (str, int, float, bool)):
        return value
    reference = _link_reference(value)
    if reference is None or hops >= _MAX_VALUE_HOPS:
        return None
    node = graph.get(reference[0])
    computed = _computed_output(graph, node, reference[1], hops)
    if computed is not None or reference[1] != 0:
        return computed
    resolved = _scalar_at(graph, _forwarded_input(node), hops + 1)
    if _node_class(node) == "FloatConstant" and isinstance(resolved, (int, float)):
        return round(resolved, 6)
    return resolved


def _scalar_chain(graph: dict[str, dict], value: object) -> list[str]:
    chain: list[str] = []
    for _ in range(_MAX_VALUE_HOPS):
        reference = _link_reference(value)
        if reference is None or reference[1] != 0:
            break
        chain.append(reference[0])
        value = _forwarded_input(graph.get(reference[0]))
    return chain


def _resolve_string(graph: dict[str, dict], node_id: str, hops: int = 0) -> tuple[str, str] | None:
    if hops >= _MAX_VALUE_HOPS:
        return None
    node = graph.get(node_id)
    if node is None:
        return None

    inputs = _node_inputs(node)
    for candidate in _STRING_PASSTHROUGH_INPUTS:
        value = inputs.get(candidate)
        if isinstance(value, str) and value.strip():
            return node_id, value
        source = _link_target(value)
        if source is not None:
            resolved = _resolve_string(graph, source, hops + 1)
            if resolved is not None:
                return resolved

    return None


def _text_at(graph: dict[str, dict], node_id: str, value: object) -> tuple[str, str] | None:
    if isinstance(value, str):
        return (node_id, value) if value.strip() else None
    source = _link_target(value)
    return _resolve_string(graph, source) if source is not None else None


def _collect_prompts(graph: dict[str, dict], node_ids: list[str]) -> list[PromptText]:
    prompts: list[tuple[int, PromptText]] = []
    seen: set[str] = set()
    claimed: set[str] = set()
    distance = {node_id: index for index, node_id in enumerate(node_ids)}
    value_sources = {
        source
        for node_id in node_ids
        for key, value in _node_inputs(graph.get(node_id)).items()
        if key in _PARAMETER_LABELS or key in _NAME_INPUT_KEYS
        for source in _scalar_chain(graph, value)
    }

    def add(
        reached_at: str, origin: str, text: str, role: ComfyPromptRole, input_name: str
    ) -> None:
        if text.strip() in seen:
            return
        seen.add(text.strip())
        claimed.add(origin)
        node = graph.get(origin)
        prompts.append(
            (
                distance.get(reached_at, len(distance)),
                PromptText(
                    role=role,
                    text=text[:_MAX_PROMPT_CHARS],
                    node_id=origin,
                    node_title=_node_title(node) or _node_class(node),
                    input_name=input_name,
                ),
            )
        )

    # The sampler slot decides a CLIPTextEncode's polarity.
    for node_id in node_ids:
        for input_name, value in _node_inputs(graph.get(node_id)).items():
            key = input_name.lower()
            if key not in _SLOT_INPUT_NAMES:
                continue
            found = _text_at(graph, node_id, value)
            if found is not None:
                role = "negative" if key in _NEGATIVE_INPUT_NAMES else "positive"
                add(node_id, *found, role, input_name)

    for node_id in node_ids:
        if node_id in claimed or (
            node_id in value_sources and _node_class(graph.get(node_id)) in _SCALAR_INPUT_KEYS
        ):
            continue
        for input_name, value in _node_inputs(graph.get(node_id)).items():
            key = input_name.lower()
            if key not in _PROMPT_INPUT_NAMES or key in _SLOT_INPUT_NAMES:
                continue
            found = _text_at(graph, node_id, value)
            if found is not None and found[0] not in claimed:
                role = "negative" if key in _NEGATIVE_INPUT_NAMES else "positive"
                add(node_id, *found, role, input_name)

    # The last stage to touch the pixels is the one being looked at.
    prompts.sort(key=lambda entry: (entry[0], entry[1].role == "negative"))
    return [prompt for _, prompt in prompts]


def _strength(graph: dict[str, dict], value: object) -> str | None:
    """A strength as a decimal, `1.0` never `1`, so loaders read alike."""
    resolved = _scalar_at(graph, value)
    if isinstance(resolved, bool) or not isinstance(resolved, (int, float)):
        return None
    return str(float(round(resolved, 4)))


def _lora_names(graph: dict[str, dict], inputs: dict[str, object], value: object) -> list[str]:
    name = _scalar_at(graph, value)
    if isinstance(name, str) and name.strip():
        model = _strength(graph, inputs.get("strength_model"))
        clip = _strength(graph, inputs.get("strength_clip"))
        if clip is not None and clip != model:
            shown = f"{model}, clip {clip}" if model is not None else f"clip {clip}"
            return [f"{name.strip()} ({shown})"]
        return [f"{name.strip()} ({model})" if model is not None else name.strip()]
    if isinstance(value, dict):
        if value.get("on") is False:
            return []
        name = value.get("lora")
        if isinstance(name, str) and name.strip():
            strength = _strength(graph, value.get("strength"))
            return [f"{name.strip()} ({strength})" if strength is not None else name.strip()]
    return []


def _stacked_lora_names(graph: dict[str, dict], value: object) -> list[str]:
    """plaguekind's LoRA Loader Stack: a JSON list of `{on, lora, str}`."""
    text = _scalar_at(graph, value)
    try:
        rows = json.loads(text) if isinstance(text, str) else None
    except ValueError:
        return []
    if not isinstance(rows, list):
        return []
    names: list[str] = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("on"):
            continue
        name = row.get("lora")
        if isinstance(name, str) and name.strip() and name != "None":
            strength = _strength(graph, row.get("str", 1.0))
            names.append(f"{name.strip()} ({strength})" if strength is not None else name.strip())
    return names


def _sampler_object_name(node: object) -> str | None:
    """The sampler a node like SamplerLCM picks by its class, named as KSamplerSelect would."""
    class_type = _node_class(node)
    if (
        not class_type.startswith(_SAMPLER_OBJECT_PREFIX)
        or "sampler_name" in _node_inputs(node)
        or _is_sampling_node(node)
    ):
        return None
    name = _CAMEL_BOUNDARY.sub("_", class_type.removeprefix(_SAMPLER_OBJECT_PREFIX))
    return name.lower() or None


def _collect_parameters(
    graph: dict[str, dict], node_ids: list[str]
) -> tuple[list[Parameter], list[str]]:
    parameters: list[Parameter] = []
    loras: list[str] = []
    seen: set[tuple[str, str]] = set()

    for node_id in node_ids:
        sampler = _sampler_object_name(graph.get(node_id))
        if sampler is not None and ("Sampler", sampler) not in seen:
            seen.add(("Sampler", sampler))
            parameters.append(Parameter(label="Sampler", value=sampler))

        inputs = _node_inputs(graph.get(node_id))
        for input_name, value in inputs.items():
            if input_name.startswith("lora") or input_name == "stack_data":
                names = (
                    _stacked_lora_names(graph, value)
                    if input_name == "stack_data"
                    else _lora_names(graph, inputs, value)
                )
                for name in names:
                    if name not in loras:
                        loras.append(name)
                continue

            label = _PARAMETER_LABELS.get(input_name)
            if label is None:
                continue
            resolved_value = _scalar_at(graph, value)
            if resolved_value is None:
                continue

            rendered = str(resolved_value)
            marker = (label, rendered)
            if marker in seen:
                continue
            seen.add(marker)
            parameters.append(Parameter(label=label, value=rendered))

    return parameters, loras


def _declared_name(graph: dict[str, dict], node: object, key: str) -> str | None:
    value = _scalar_at(graph, _node_inputs(node).get(key))
    return value if isinstance(value, str) and value.strip() else None


def _is_preview(graph: dict[str, dict], node: object) -> bool:
    """A preview class, or its save flag is off."""
    if any(marker in _node_class(node).lower() for marker in _PREVIEW_CLASS_MARKERS):
        return True
    inputs = _node_inputs(node)
    return any(_scalar_at(graph, inputs.get(key)) is False for key in _SAVE_FLAG_INPUTS)


def _prefix_basename(prefix: str) -> str:
    return re.split(r"[\\/]", prefix.strip())[-1].strip()


def _matches_filename(
    prefix: str | None, filename: str | None, file_path: Path, class_type: str
) -> bool:
    # Embedded naming templates are not the names used when the nodes ran.
    if (
        filename
        and not re.search(r"%[^%]+%", filename)
        and _prefix_basename(filename).casefold() == file_path.name.casefold()
    ):
        return True
    if not prefix or re.search(r"%[^%]+%", prefix):
        return False
    basename = _prefix_basename(prefix)
    if not basename:
        return False
    if basename.casefold() == file_path.stem.casefold():
        return True
    suffix = r"[_-]\d{2,}_?"
    if class_type == "VHS_VideoCombine" and file_path.suffix.lower() in {".mp4", ".mov", ".m4v"}:
        suffix = r"(?:[_-]\d{2,}_?|_\d{2,}-audio)"
    return re.fullmatch(re.escape(basename) + suffix, file_path.stem, re.IGNORECASE) is not None


def _output_nodes(graph: dict[str, dict]) -> set[str]:
    """Named by class; Save Text File, LoRA savers and the like are excluded."""
    outputs: set[str] = set()
    for node_id, node in graph.items():
        lowered = _node_class(node).lower()
        named = any(marker in lowered for marker in _SAVE_CLASS_MARKERS + _PREVIEW_CLASS_MARKERS)
        if lowered in _EXTRA_OUTPUT_CLASSES or (
            named and _MEDIA_INPUTS & _node_inputs(node).keys()
        ):
            outputs.add(node_id)
    return outputs


def _instance_id(node_id: str) -> str:
    return node_id.split(":", 1)[0]


def _subgraph_labels(workflow: object) -> dict[str, str]:
    if not isinstance(workflow, dict):
        return {}

    definitions = workflow.get("definitions")
    subgraphs = definitions.get("subgraphs") if isinstance(definitions, dict) else None
    if not isinstance(subgraphs, list):
        return {}

    names: dict[str, str] = {}
    definitions_by_id: dict[str, dict] = {}
    for definition in subgraphs:
        if not isinstance(definition, dict):
            continue
        identifier = definition.get("id")
        name = definition.get("name")
        if isinstance(identifier, str):
            definitions_by_id[identifier] = definition
        if isinstance(identifier, str) and isinstance(name, str) and name.strip():
            names[identifier] = name.strip()

    labels: dict[str, str] = {}

    def label_of(node: dict) -> str | None:
        title = node.get("title")
        label = title if isinstance(title, str) and title.strip() else names.get(node.get("type"))
        return label.strip() if label else None

    # Keyed by flattened path, such as `9:20`.
    def visit_nested(definition: dict, prefix: str, depth: int) -> None:
        nodes = definition.get("nodes")
        for node in nodes if isinstance(nodes, list) and depth < _MAX_VALUE_HOPS else []:
            inner = definitions_by_id.get(node.get("type")) if isinstance(node, dict) else None
            if inner is None:
                continue
            identifier = f"{prefix}{node.get('id')}"
            if label := label_of(node):
                labels[identifier] = label
            visit_nested(inner, f"{identifier}:", depth + 1)

    nodes = workflow.get("nodes")
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue
        if label := label_of(node):
            labels[str(node.get("id"))] = label
        if (definition := definitions_by_id.get(node.get("type"))) is not None:
            visit_nested(definition, f"{node.get('id')}:", 1)

    return labels


def _branch_label(node: object, ancestry: list[str], subgraph_labels: dict[str, str]) -> str:
    group = next(
        (
            label
            for label in (subgraph_labels.get(_instance_id(step)) for step in ancestry)
            if label
        ),
        None,
    )
    return group or _node_title(node) or _node_class(node) or "Output"


def _parse_graph(raw: str) -> dict[str, dict] | None:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(parsed, dict):
        return None
    graph = {
        str(key): value
        for key, value in parsed.items()
        if isinstance(value, dict) and "class_type" in value
    }
    return graph or None


def _parse_workflow(raw: str) -> dict | None:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


#: Where a payload hides without per-key metadata.
_NESTED_KEYS = ("prompt", "Prompt", "PROMPT", "workflow", "Workflow", "WORKFLOW")


def _nested_values(values: dict[str, str]) -> dict[str, str]:
    """A muxed video holds the whole payload in one comment, so unwrap a level."""
    nested: dict[str, str] = {}

    for raw in values.values():
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(parsed, dict):
            continue

        for key in _NESTED_KEYS:
            if key in nested or key not in parsed:
                continue
            value = parsed[key]
            nested[key] = value if isinstance(value, str) else json.dumps(value)

    return nested


def _metadata_values(file_path: Path) -> dict[str, str]:
    values = read_media_metadata_values(file_path)
    # Top level wins: only a container without named keys needs unwrapping.
    return {**_nested_values(values), **values} if values else {}


def _editor_workflow(values: dict[str, str]) -> str | None:
    """Only what ComfyUI's paste handler would load: ``version``, ``nodes`` and ``extra``."""
    for key in ("workflow", "Workflow", "WORKFLOW"):
        raw = values.get(key)
        workflow = _parse_workflow(raw or "")
        if workflow:
            pasteable = all(workflow.get(field) for field in ("version", "nodes", "extra"))
            return raw if pasteable else None
    return None


def read_editor_workflow(file_path: Path) -> str | None:
    return _editor_workflow(_metadata_values(file_path))


def _declared_sizes(graph: dict[str, dict], ancestry: list[str], key: str) -> frozenset[int]:
    values = (_scalar_at(graph, _node_inputs(graph.get(node_id)).get(key)) for node_id in ancestry)
    return frozenset(
        int(value)
        for value in values
        if isinstance(value, int | float) and not isinstance(value, bool) and value > 0
    )


def _media_size(file_path: Path) -> tuple[int, int] | None:
    try:
        stat = file_path.stat()
    except OSError:
        return None
    media_type = "image" if file_path.suffix.lower() == ".png" else "video"
    return media_dimensions(file_path, media_type, stat.st_mtime_ns, stat.st_size)


def _size_tiebreak(candidates: list[OutputBranch], file_path: Path) -> OutputBranch | None:
    """The same-named output set to render at the file's size, or None."""
    if len(candidates) < 2 or not any(branch.widths and branch.heights for branch in candidates):
        return None
    size = _media_size(file_path)
    if size is None:
        return None
    fitting = [
        branch
        for branch in candidates
        if not (branch.widths and branch.heights)
        or (size[0] in branch.widths and size[1] in branch.heights)
    ]
    return fitting[0] if len(fitting) == 1 else None


def _sort_branches(branches: list[OutputBranch], matched_id: str | None) -> list[OutputBranch]:
    """The dialog opens on the first."""
    return sorted(
        branches,
        key=lambda branch: (
            branch.node_id != matched_id,
            not branch.matches_filename,
            branch.is_preview,
            not branch.prompts,
            branch.node_id,
        ),
    )


def _empty() -> WorkflowPrompts:
    return WorkflowPrompts(
        has_workflow=False,
        source="none",
        branches=[],
        matched_node_id=None,
        orphan_prompts=[],
    )


def _output_branch(
    graph: dict[str, dict],
    full: dict[str, dict],
    editor: dict[str, EditorNode],
    node_id: str,
    stages: tuple[set[str], set[str], set[str]],
    subgraph_labels: dict[str, str],
    *,
    file_path: Path | None,
    passless: bool = False,
) -> OutputBranch:
    """``file_path`` is None for a graph no file holds."""
    node = graph[node_id]
    class_type = _node_class(node)
    ancestry = _ancestors(graph, node_id)
    live = _live_nodes(graph, node_id)
    ran = [step for step in ancestry if step in live]
    # Only the stage that made the file sets its size.
    sized = [step for step in _stage_ancestors(graph, node_id, stages) if step in live]
    prefix = _declared_name(graph, node, "filename_prefix")
    filename = _declared_name(graph, node, "filename")
    bypassed = _bypassed_on_path(graph, editor, node_id, set(ancestry))
    after_sampling, shared, passes = _split_by_pass(
        full, ancestry, bypassed, live, editor, subgraph_labels
    )
    prompts = _collect_prompts(graph, ran)
    branch_map = _branch_map(
        full,
        editor,
        node_id,
        ancestry + bypassed,
        live,
        set(bypassed),
        prompts,
        passless=passless,
    )
    parameters, loras = _collect_parameters(graph, after_sampling)

    return OutputBranch(
        node_id=node_id,
        class_type=class_type,
        label=_branch_label(node, ancestry, subgraph_labels),
        filename_prefix=prefix,
        filename=filename,
        is_preview=_is_preview(graph, node),
        matches_filename=file_path is not None
        and _matches_filename(prefix, filename, file_path, class_type),
        prompts=prompts,
        parameters=parameters,
        loras=loras,
        stages=passes,
        shared=shared,
        map=branch_map,
        widths=_declared_sizes(graph, sized, "width"),
        heights=_declared_sizes(graph, sized, "height"),
    )


#: How a preset's map names the boxes DataForge fills in.
SOURCE_BOX_LABEL = "Each source file"
SOURCE_BOX_DETAIL = "DataForge loads each file the job runs on here."
PROMPT_BOX_DETAIL = "DataForge writes the dialog's prompt here; empty runs this saved text."


def extract_graph_branch(
    graph: dict[str, dict],
    output_node: str,
    *,
    source_node: str | None = None,
    prompt_node: str | None = None,
) -> OutputBranch | None:
    """Mapped even when nothing samples; None when the node is not in the graph."""
    if output_node not in graph or not isinstance(graph[output_node], dict):
        return None
    stages = _generation_stages(graph, _output_nodes(graph) | {output_node})
    branch = _output_branch(
        graph, graph, {}, output_node, stages, {}, file_path=None, passless=True
    )

    def filled(box: MapNode) -> MapNode:
        if source_node is not None and box.id == source_node:
            return replace(box, label=SOURCE_BOX_LABEL, detail=[SOURCE_BOX_DETAIL])
        if prompt_node is not None and box.id.startswith(f"prompt:{prompt_node}:"):
            return replace(box, detail=[PROMPT_BOX_DETAIL, *box.detail])
        return box

    branch.map = [filled(box) for box in branch.map]
    return branch


def extract_workflow_prompts(file_path: Path) -> WorkflowPrompts:
    values = _metadata_values(file_path)
    if not values:
        return _empty()

    graph = None
    for key in ("prompt", "Prompt", "PROMPT"):
        graph = _parse_graph(values.get(key, ""))
        if graph:
            break

    workflow = None
    for key in ("workflow", "Workflow", "WORKFLOW"):
        workflow = _parse_workflow(values.get(key, ""))
        if workflow:
            break

    if graph is None:
        return _empty()

    # Not the routes added here for reading it.
    raw_graph = graph
    subgraph_labels = _subgraph_labels(workflow)
    graph = _with_virtual_routes(graph, workflow)

    branches: list[OutputBranch] = []
    covered: set[str] = set()
    outputs = _output_nodes(graph)
    stages = _generation_stages(graph, outputs)
    editor = flatten_editor_graph(workflow)
    # A stand-in only fills in what never ran.
    full = {
        **{node_id: _stand_in(entry) for node_id, entry in editor.items() if entry.bypassed},
        **graph,
    }

    for node_id in graph:
        if node_id not in outputs:
            continue
        branch = _output_branch(
            graph, full, editor, node_id, stages, subgraph_labels, file_path=file_path
        )
        branch.generation = embedded_generation(
            raw_graph, node_id, _positive_prompt_nodes(branch), source=file_path.stem
        )
        # The whole chain that made the file, earlier stages included.
        covered.update(_ancestors(graph, node_id))
        branches.append(branch)

    # A preview claims the file only when no saving output does.
    if any(branch.matches_filename and not branch.is_preview for branch in branches):
        for branch in branches:
            branch.matches_filename = branch.matches_filename and not branch.is_preview
    claimants = [branch for branch in branches if branch.matches_filename]
    by_size = _size_tiebreak(claimants, file_path)
    matched = claimants[0] if len(claimants) == 1 else by_size
    matched_id = matched.node_id if matched else None
    orphans = _collect_prompts(graph, [node_id for node_id in graph if node_id not in covered])

    return WorkflowPrompts(
        has_workflow=True,
        source="prompt",
        branches=_sort_branches(branches, matched_id),
        matched_node_id=matched_id,
        orphan_prompts=orphans,
        has_editor_workflow=_editor_workflow(values) is not None,
        matched_by_size=by_size is not None,
    )


def _positive_prompt_nodes(branch: OutputBranch) -> list[str]:
    return [prompt.node_id for prompt in branch.prompts if prompt.role == "positive"]


def load_embedded_generation(file_path: Path, node_id: str) -> ComfyWorkflow:
    extracted = extract_workflow_prompts(file_path)
    if not extracted.has_workflow:
        raise ComfyWorkflowError(f"{file_path.name} carries no ComfyUI workflow.")
    branch = next((entry for entry in extracted.branches if entry.node_id == node_id), None)
    if branch is None:
        raise ComfyWorkflowError(
            f"The workflow in {file_path.name} has no output node {node_id}. Re-open its "
            "workflow to pick another."
        )
    if branch.generation is not None:
        return branch.generation

    values = _metadata_values(file_path)
    graph = next(
        (
            parsed
            for key in ("prompt", "Prompt", "PROMPT")
            if (parsed := _parse_graph(values.get(key, "")))
        ),
        None,
    )
    # Extraction keeps None, not the error.
    return generation_workflow(
        graph or {}, node_id, _positive_prompt_nodes(branch), source=file_path.stem
    )
