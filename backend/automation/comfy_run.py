"""Run ComfyUI workflow: edit the scope's files, or make new ones.

Editing runs a preset with a source loader once per file in the scope and stages each result as
a candidate (``comfy_process``). Generating makes ``count`` new numbered files in the folder and
ignores the scope (``comfy_generate``); a source loader then loads one start file, or is left
out. Without a mode the preset decides: a source loader edits. A file's own workflow generates.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from automation.comfy_generate import run_comfy_generate_job, validate_comfy_generate_folder
from automation.comfy_process import run_comfy_process_job, validate_comfy_process_folder
from automation.job_runner import ProgressCallback, ShouldCancel
from external.comfy_workflows import ComfyWorkflowError, load_comfy_workflow
from schemas import ComfyRunMode


def comfy_run_generates(
    preset: str, source: Mapping[str, object] | None, mode: ComfyRunMode | None = None
) -> bool:
    """Whether the run makes new files; an unreadable preset counts as editing."""
    if mode is not None:
        return mode == "generate"
    if source is not None:
        return True
    try:
        return load_comfy_workflow(preset).generates
    except ComfyWorkflowError:
        return False


def _generates_or_refuse(
    preset: str,
    source: Mapping[str, object] | None,
    mode: ComfyRunMode | None,
    *,
    edits_only: bool,
) -> bool:
    generates = comfy_run_generates(preset, source, mode)
    if source is not None and not generates:
        raise ValueError("A file's own workflow can only make new files, not edit them.")
    if generates and edits_only:
        raise ValueError(
            f'The preset "{preset}" makes new files, so it cannot be a workflow step: the step '
            "runs on files chosen before they exist. Choose a preset that loads a source file."
        )
    return generates


def validate_comfy_run_folder(
    folder: Path,
    *,
    preset: str = "",
    prompt_text: str = "",
    inputs: Mapping[str, object] | None = None,
    name_prefix: str = "",
    source: Mapping[str, object] | None = None,
    selected_paths: list[Path] | None = None,
    edits_only: bool = False,
    mode: ComfyRunMode | None = None,
    start_path: str | None = None,
) -> None:
    """Refuse at queue time what would fail on the first run; does not probe ComfyUI."""
    if _generates_or_refuse(preset, source, mode, edits_only=edits_only):
        validate_comfy_generate_folder(
            folder,
            preset=preset,
            prompt_text=prompt_text,
            inputs=inputs,
            name_prefix=name_prefix,
            source=source,
            start_path=start_path,
        )
        return
    validate_comfy_process_folder(
        folder,
        preset=preset,
        prompt_text=prompt_text,
        inputs=inputs,
        selected_paths=selected_paths,
    )


def run_comfy_run_job(
    folder: Path,
    *,
    on_progress: ProgressCallback | None = None,
    should_cancel: ShouldCancel | None = None,
    preset: str = "",
    seed: int | None = None,
    prompt_text: str = "",
    inputs: Mapping[str, object] | None = None,
    overwrite_candidates: bool = False,
    count: int = 1,
    name_prefix: str = "",
    caption_from_prompt: bool = False,
    source: Mapping[str, object] | None = None,
    selected_paths: list[Path] | None = None,
    edits_only: bool = False,
    mode: ComfyRunMode | None = None,
    start_path: str | None = None,
) -> dict[str, object]:
    # The preset may have changed kind while queued; each half revalidates the rest.
    if _generates_or_refuse(preset, source, mode, edits_only=edits_only):
        return run_comfy_generate_job(
            folder,
            on_progress=on_progress,
            should_cancel=should_cancel,
            preset=preset,
            seed=seed,
            prompt_text=prompt_text,
            inputs=inputs,
            count=count,
            name_prefix=name_prefix,
            caption_from_prompt=caption_from_prompt,
            source=source,
            start_path=start_path,
        )
    return run_comfy_process_job(
        folder,
        on_progress=on_progress,
        should_cancel=should_cancel,
        preset=preset,
        seed=seed,
        prompt_text=prompt_text,
        inputs=inputs,
        overwrite_candidates=overwrite_candidates,
        selected_paths=selected_paths,
    )
