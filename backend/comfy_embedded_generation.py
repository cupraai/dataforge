"""Run a file's own workflow as a generation, cut to one output.

An output whose path loads a file still generates: each run loads a start file instead, or runs
without the loader.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from copy import deepcopy
from typing import Any

from external.comfy_workflows import (
    OUTPUT_NODE_TITLE,
    PROMPT_NODE_TITLE,
    ComfyWorkflow,
    ComfyWorkflowError,
    parse_comfy_workflow,
    prompt_input_key,
)


def _link_source(value: object) -> str | None:
    if (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], str | int)
        and isinstance(value[1], int)
        and not isinstance(value[1], bool)
    ):
        return str(value[0])
    return None


def _inputs(node: dict[str, Any]) -> dict[str, Any]:
    inputs = node.get("inputs")
    return inputs if isinstance(inputs, dict) else {}


def _title(node: dict[str, Any]) -> str:
    meta = node.get("_meta")
    title = meta.get("title") if isinstance(meta, dict) else None
    return title.strip() if isinstance(title, str) else ""


def _set_title(node: dict[str, Any], title: str) -> None:
    meta = node.get("_meta")
    node["_meta"] = {**meta, "title": title} if isinstance(meta, dict) else {"title": title}


def generation_graph(
    graph: dict[str, Any], output_node: str, positive_prompt_nodes: Iterable[str]
) -> dict[str, Any] | None:
    """``output_node``'s ancestors, titled for the preset parser; None for a dangling link."""
    if not isinstance(graph.get(output_node), dict):
        return None

    kept: dict[str, Any] = {}
    queue = [output_node]
    while queue:
        node_id = queue.pop()
        if node_id in kept:
            continue
        node = graph.get(node_id)
        if not isinstance(node, dict) or not isinstance(node.get("class_type"), str):
            return None
        kept[node_id] = deepcopy(node)
        queue.extend(
            source
            for value in _inputs(node).values()
            if (source := _link_source(value)) is not None and source not in kept
        )

    for node_id, node in kept.items():
        if node_id != output_node and _title(node) == OUTPUT_NODE_TITLE:
            _set_title(node, node["class_type"])
    _set_title(kept[output_node], OUTPUT_NODE_TITLE)

    titled_prompts = [node for node in kept.values() if _title(node) == PROMPT_NODE_TITLE]
    if not titled_prompts:
        for node_id in positive_prompt_nodes:
            node = kept.get(node_id)
            if node is not None and prompt_input_key(node) is not None:
                _set_title(node, PROMPT_NODE_TITLE)
                break

    return kept


def generation_workflow(
    graph: dict[str, Any], output_node: str, positive_prompt_nodes: Iterable[str], *, source: str
) -> ComfyWorkflow:
    trimmed = generation_graph(graph, output_node, positive_prompt_nodes)
    if trimmed is None:
        raise ComfyWorkflowError(
            f"The workflow in {source} links to nodes it does not hold, so ComfyUI cannot run "
            "this output."
        )
    return parse_comfy_workflow(json.dumps(trimmed), source=source)


def embedded_generation(
    graph: dict[str, Any], output_node: str, positive_prompt_nodes: Iterable[str], *, source: str
) -> ComfyWorkflow | None:
    """None for an output that cannot run, such as one with two loaders neither is titled for."""
    try:
        return generation_workflow(graph, output_node, positive_prompt_nodes, source=source)
    except ComfyWorkflowError:
        return None
