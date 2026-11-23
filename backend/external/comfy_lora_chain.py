"""Chains LoRAs after a workflow's model, for graphs that load none of their own."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from external.comfy_workflows import (
    MODEL_LOADER_CLASSES,
    MODEL_NODE_TITLE,
    ComfyWorkflow,
    ComfyWorkflowError,
    graph_nodes,
    link_of,
    node_inputs,
)

#: Core nodes whose model is output 0; any other titled class asks ComfyUI.
_MODEL_OUTPUT_INDEX = {
    "UNETLoader": 0,
    "CheckpointLoaderSimple": 0,
    "LoraLoader": 0,
    "LoraLoaderModelOnly": 0,
}
#: Diffusion-model LoRAs from AI-Toolkit carry no text-encoder weights.
_LOADER_CLASS = "LoraLoaderModelOnly"
#: Never "DataForge ...": a result's embedded workflow would read the loaders as inputs.
_LOADER_TITLE = "Showcase LoRA"


@dataclass(frozen=True)
class LoraRef:
    #: Exactly as ComfyUI lists it.
    name: str
    strength: float


def require_model_nodes(workflow: ComfyWorkflow) -> None:
    if workflow.model_nodes:
        return
    loaders = sum(
        1 for _, node in graph_nodes(workflow.prompt) if node["class_type"] in MODEL_LOADER_CLASSES
    )
    if loaders:
        raise ComfyWorkflowError(
            f'The preset "{workflow.preset}" loads {loaders} models and none is titled '
            f'"{MODEL_NODE_TITLE}", so DataForge cannot tell where the LoRAs go. Title the node '
            "whose model they patch and re-export it."
        )
    raise ComfyWorkflowError(
        f'The preset "{workflow.preset}" has no UNETLoader or CheckpointLoaderSimple to add LoRAs '
        f'to. Title the node whose model they patch "{MODEL_NODE_TITLE}" and re-export it.'
    )


def known_model_output(workflow: ComfyWorkflow, node_id: str) -> int | None:
    """None for a class whose outputs only ComfyUI can describe."""
    return _MODEL_OUTPUT_INDEX.get(workflow.prompt[node_id]["class_type"])


def model_output_index(info: Mapping[str, Any] | None) -> int | None:
    """From an ``/object_info`` entry."""
    outputs = info.get("output") if isinstance(info, Mapping) else None
    if not isinstance(outputs, list):
        return None
    return next((index for index, kind in enumerate(outputs) if kind == "MODEL"), None)


def _next_node_id(prompt: dict[str, Any]) -> int:
    """Past every number in every id, so a subgraph's ``75:12`` never collides."""
    numbers = [int(part) for key in prompt for part in str(key).split(":") if part.isdigit()]
    return max(numbers, default=0) + 1


def with_loras(
    workflow: ComfyWorkflow,
    prompt: dict[str, Any],
    loras: Sequence[LoraRef],
    model_outputs: Mapping[str, int],
) -> dict[str, Any]:
    """Chain ``loras`` after each model node and feed its consumers the end; returns ``prompt``.

    ``model_outputs`` names the model output of titled classes ``known_model_output`` cannot.
    """
    if not loras:
        return prompt
    require_model_nodes(workflow)

    next_id = _next_node_id(prompt)
    for model_node in workflow.model_nodes:
        output = model_outputs.get(model_node, known_model_output(workflow, model_node))
        class_type = prompt[model_node]["class_type"]
        if output is None:
            raise ComfyWorkflowError(
                f"ComfyUI did not say which output of {class_type}, the node titled "
                f'"{MODEL_NODE_TITLE}", is its model. Title the model loader itself instead.'
            )
        consumers = [
            (node_id, key)
            for node_id, node in graph_nodes(prompt)
            for key, value in node_inputs(node).items()
            if link_of(value) == (model_node, output)
        ]
        if not consumers:
            raise ComfyWorkflowError(
                f'The model of {class_type}, the node "{model_node}" in preset '
                f'"{workflow.preset}", feeds nothing, so LoRAs added after it would never run.'
            )

        previous: list[Any] = [model_node, output]
        for position, lora in enumerate(loras, start=1):
            node_id = str(next_id)
            next_id += 1
            prompt[node_id] = {
                "class_type": _LOADER_CLASS,
                "inputs": {
                    "model": previous,
                    "lora_name": lora.name,
                    "strength_model": lora.strength,
                },
                "_meta": {"title": f"{_LOADER_TITLE} {position}"},
            }
            previous = [node_id, 0]
        for node_id, key in consumers:
            prompt[node_id]["inputs"][key] = list(previous)
    return prompt
