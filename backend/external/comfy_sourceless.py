"""Runs a workflow that loads a source file without one."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from copy import deepcopy
from dataclasses import replace
from typing import Any

from comfy_switches import is_switch_side
from external.comfy_workflows import (
    ComfyWorkflow,
    ComfyWorkflowError,
    graph_nodes,
    link_of,
    node_inputs,
    node_title,
)

#: Answers a class with its ``/object_info`` entry; None for one ComfyUI does not know.
NodeInfo = Callable[[str], Mapping[str, Any] | None]


def _optional_input(info: Mapping[str, Any] | None, key: str) -> list[Any] | None:
    """A growing input such as ``images.image_1`` is listed under its first part."""
    inputs = info.get("input") if info is not None else None
    optional = inputs.get("optional") if isinstance(inputs, Mapping) else None
    if not isinstance(optional, Mapping):
        return None
    spec = optional.get(key, optional.get(key.split(".")[0]))
    return spec if isinstance(spec, list) else None


def _passes_on(info: Mapping[str, Any] | None, key: str) -> bool:
    """A wildcard input: a node left without one has nothing to hand out."""
    spec = _optional_input(info, key)
    kind = spec[0] if spec else None
    return isinstance(kind, str) and (kind == "*" or kind.startswith("COMFY_MATCHTYPE"))


def _switch_sides(node: dict[str, Any]) -> list[str]:
    return [key for key in node_inputs(node) if is_switch_side(node["class_type"], key)]


def _survives(node: dict[str, Any], lost: str, node_info: NodeInfo) -> bool:
    """Whether ``node`` still runs once its input ``lost``, already unlinked, is gone."""
    class_type = node["class_type"]
    if is_switch_side(class_type, lost):
        sides = _switch_sides(node)
        # One side left is passed on whatever the selector says.
        return len(sides) == 1 or (
            len(sides) > 1 and lost != f"input{node_inputs(node).get('select')}"
        )

    info = node_info(class_type)
    if _optional_input(info, lost) is None:
        return False
    return not _passes_on(info, lost) or any(
        _passes_on(info, key) and link_of(value) is not None
        for key, value in node_inputs(node).items()
    )


def _prune(graph: dict[str, Any], source: str, node_info: NodeInfo) -> dict[str, str]:
    """Remove ``source`` and every node that cannot run without it.

    Answers each removed node with the one whose own input made it leave, for a refusal to name.
    """
    removed = {source: source}
    settled = False
    while not settled:
        settled = True
        for node_id, node in graph_nodes(graph):
            if node_id in removed:
                continue
            for key, value in list(node_inputs(node).items()):
                link = link_of(value)
                if link is None or link[0] not in removed:
                    continue
                settled = False
                del node["inputs"][key]
                if not _survives(node, key, node_info):
                    cause = removed[link[0]]
                    removed[node_id] = node_id if cause == source else cause
                    break

    for node_id in removed:
        del graph[node_id]
    return removed


def _bypass_one_sided_switches(graph: dict[str, Any], original: dict[str, Any]) -> None:
    """Feed the consumers of a switch that lost a side directly: its selector may name that side."""
    for switch, node in graph_nodes(graph):
        sides = _switch_sides(node)
        if len(sides) != 1 or sides == _switch_sides(original[switch]):
            continue
        kept = node_inputs(node)[sides[0]]
        if link_of(kept) is None:
            continue
        for _, consumer in graph_nodes(graph):
            for key, value in node_inputs(consumer).items():
                # Its other outputs only describe the choice.
                if link_of(value) == (switch, 0):
                    consumer["inputs"][key] = list(kept)


def without_source(workflow: ComfyWorkflow, node_info: NodeInfo) -> ComfyWorkflow:
    """The workflow without its loader and every node that cannot run without it.

    A switch passes on the side that is left. Refused when the output or every model would leave.
    """
    if workflow.input_node is None:
        return workflow

    graph = deepcopy(workflow.prompt)
    removed = _prune(graph, workflow.input_node, node_info)

    if workflow.output_node in removed:
        needy = workflow.prompt[removed[workflow.output_node]]
        name = node_title(needy) or needy["class_type"]
        raise ComfyWorkflowError(
            f'the preset "{workflow.preset}" cannot run without one: its node "{name}" '
            f"({needy['class_type']}) requires it."
        )
    model_nodes = tuple(node_id for node_id in workflow.model_nodes if node_id not in removed)
    if workflow.model_nodes and not model_nodes:
        raise ComfyWorkflowError(
            f'the preset "{workflow.preset}" runs no model without one, so there is nothing to '
            "add LoRAs to."
        )

    _bypass_one_sided_switches(graph, workflow.prompt)

    prompt_gone = workflow.prompt_node in removed
    return replace(
        workflow,
        prompt=graph,
        input_node=None,
        input_key=None,
        seed_nodes=tuple(node_id for node_id in workflow.seed_nodes if node_id not in removed),
        prompt_node=None if prompt_gone else workflow.prompt_node,
        prompt_key=None if prompt_gone else workflow.prompt_key,
        custom_inputs=tuple(entry for entry in workflow.custom_inputs if entry.node not in removed),
        model_nodes=model_nodes,
    )
