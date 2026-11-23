from __future__ import annotations

import secrets
from collections.abc import Mapping
from pathlib import Path

from automation.comfy_generator import (
    PROCESSED_STAT_KEYS,
    SEED_LIMIT,
    GenerationRun,
    Generator,
    caption_text_for,
    name_prefix_for,
    refuse_staging_folder,
    validate_name_prefix,
)
from automation.job_runner import CANCELLED, ProgressCallback, ShouldCancel
from comfy_prompts import load_embedded_generation
from constants import COMFY_WORKFLOW_EXTENSIONS
from external.comfy_client import COMFY_TRANSFER_TIMEOUT_SECONDS, open_comfy_client
from external.comfy_workflows import (
    PROMPT_NODE_TITLE,
    ComfyWorkflow,
    ComfyWorkflowError,
    load_comfy_workflow,
    require_generation,
    resolve_custom_inputs,
)
from filesystem import normalize_user_path
from numbered_files import sweep_temporary_files


def _source_file(source: Mapping[str, object]) -> tuple[Path, str]:
    path, node_id = source.get("path"), source.get("node_id")
    if not isinstance(path, str) or not path.strip() or not isinstance(node_id, str) or not node_id:
        raise ValueError("Choose the file and output whose workflow to run.")
    file_path = normalize_user_path(path)
    if not file_path.is_file():
        raise ValueError(
            f"The file {file_path.name} is no longer there, so its workflow cannot run."
        )
    if file_path.suffix.lower() not in COMFY_WORKFLOW_EXTENSIONS:
        raise ValueError(f"{file_path.name} cannot carry a ComfyUI workflow.")
    return file_path, node_id


def load_generation(preset: str, source: Mapping[str, object] | None) -> ComfyWorkflow:
    if source is not None:
        if preset.strip():
            raise ValueError("Run either a preset or a file's workflow, not both.")
        workflow = load_embedded_generation(*_source_file(source))
    else:
        workflow = load_comfy_workflow(preset)
    require_generation(workflow)
    return workflow


def _default_prefix(preset: str, workflow: ComfyWorkflow, source: object) -> str:
    """The source stem loses the separator ComfyUI ends it with."""
    if source is None:
        return preset
    return workflow.preset.rstrip("_ .") or "generated"


def validate_comfy_generate_folder(
    folder: Path,
    *,
    preset: str = "",
    prompt_text: str = "",
    inputs: Mapping[str, object] | None = None,
    name_prefix: str = "",
    source: Mapping[str, object] | None = None,
) -> ComfyWorkflow:
    """Refuse at queue time what would fail on the first run; does not probe ComfyUI."""
    refuse_staging_folder(folder)

    try:
        workflow = load_generation(preset, source)
        resolve_custom_inputs(workflow, inputs or {})
    except ComfyWorkflowError as exc:
        # ComfyWorkflowError would escape the route as a 500.
        raise ValueError(str(exc)) from exc

    if prompt_text.strip() and workflow.prompt_node is None:
        raise ValueError(
            f'The preset "{workflow.preset}" has no node titled "{PROMPT_NODE_TITLE}", so there '
            f"is nowhere to put a prompt. Title one in ComfyUI and re-export it, or clear the "
            f"prompt to run the workflow as saved."
        )

    validate_name_prefix(name_prefix_for(_default_prefix(preset, workflow, source), name_prefix))
    return workflow


def seed_for(base: int | None, index: int, has_seed_nodes: bool) -> int | None:
    """A fresh random seed per run, or the entered one counting up."""
    if not has_seed_nodes:
        return None
    if base is None:
        return secrets.randbelow(SEED_LIMIT)
    return (base + index) % SEED_LIMIT


def run_comfy_generate_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    preset: str = "",
    seed: int | None = None,
    prompt_text: str = "",
    inputs: Mapping[str, object] | None = None,
    count: int = 1,
    name_prefix: str = "",
    caption_from_prompt: bool = False,
    source: Mapping[str, object] | None = None,
    selected_paths: list[Path] | None = None,
) -> dict[str, object]:
    del selected_paths
    # The preset or file may have changed while queued.
    workflow = validate_comfy_generate_folder(
        folder,
        preset=preset,
        prompt_text=prompt_text,
        inputs=inputs,
        name_prefix=name_prefix,
        source=source,
    )
    prompt_text = prompt_text.strip()
    sweep_temporary_files(folder)
    generator = Generator(
        folder,
        workflow,
        prefix=name_prefix_for(_default_prefix(preset, workflow, source), name_prefix),
        should_cancel=should_cancel,
    )
    custom_values = resolve_custom_inputs(workflow, inputs or {})
    caption_text = caption_text_for(workflow, prompt_text) if caption_from_prompt else None

    stats: dict[str, int] = {"total": count}
    results: list[dict[str, object]] = []

    def report(index: int, done: int) -> None:
        if on_progress:
            on_progress(str(folder), f"Generation {index} of {count}", done, count, dict(stats))

    client = open_comfy_client(COMFY_TRANSFER_TIMEOUT_SECONDS)
    try:
        for index in range(1, count + 1):
            if should_cancel and should_cancel():
                stats[CANCELLED] = count - index + 1
                break

            report(index, index - 1)
            run_seed = seed_for(seed, index - 1, bool(workflow.seed_nodes))
            outcome = generator.attempt(
                client,
                index,
                GenerationRun(prompt_text, custom_values, caption_text, run_seed),
            )
            seed_note = f"Seed {run_seed}" if run_seed is not None else None
            results.extend(generator.success_row(path, [seed_note]) for path in outcome.written)

            if outcome.status == CANCELLED:
                stats[CANCELLED] = count - index + 1
                break
            if outcome.status != "success":
                stats[outcome.status] = stats.get(outcome.status, 0) + 1
                results.append(
                    generator.failure_row(
                        index, f"Generation {index}", outcome.status, outcome.message
                    )
                )
            else:
                stats["success"] = stats.get("success", 0) + 1
            report(index, index)
    finally:
        client.close()

    return {
        "folder": str(folder),
        "total": count,
        "processed": sum(stats.get(key, 0) for key in PROCESSED_STAT_KEYS),
        "stats": stats,
        "results": results,
    }
