"""Make new media in a folder by running a ComfyUI generation preset a number of times."""

from __future__ import annotations

import os
import re
import secrets
import tempfile
import uuid
from collections.abc import Mapping
from contextlib import suppress
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

from automation.job_runner import CANCELLED, ProgressCallback, ShouldCancel
from captions import CaptionConflictError, save_caption
from comfy_prompts import load_embedded_generation
from comfy_settings import get_comfy_media_timeout
from constants import (
    COMFY_CANDIDATE_SUFFIXES,
    COMFY_WORKFLOW_EXTENSIONS,
    MAX_COMFY_GENERATE_PREFIX_LENGTH,
    MOTION_EXTENSIONS,
    STAGING_DIR_NAME,
)
from external.comfy_client import (
    COMFY_TRANSFER_TIMEOUT_SECONDS,
    ComfyError,
    ComfyUnavailableError,
    download_view_to,
    open_comfy_client,
    submit_prompt,
)
from external.comfy_execution import ComfyRunCancelled, await_outputs, gpu_slot
from external.comfy_workflows import (
    PROMPT_NODE_TITLE,
    ComfyWorkflow,
    ComfyWorkflowError,
    build_comfy_prompt,
    load_comfy_workflow,
    require_generation,
    resolve_custom_inputs,
)
from file_write import publish_new_file
from filesystem import normalize_user_path
from media_claims import claim
from schemas import ComfyInputValue
from video_frames import validate_candidate_media

# Terminal per-run statuses. Omit ``cancelled`` or a cancelled run looks complete.
PROCESSED_STAT_KEYS = ("success", "comfy_error", "write_error")

#: Same range as the editor's fills; every sampler takes it.
SEED_LIMIT = 2**32

NUMBER_WIDTH = 4

#: Savers whose output is a still; anything else may write a clip and gets the video timeout.
_STILL_OUTPUT_CLASSES = frozenset({"SaveImage", "PreviewImage", "SaveImageWebsocket"})

#: Characters Windows refuses in a name, which a prefix shared across platforms must avoid.
_UNSAFE_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

_TEMP_PREFIX = ".generate-"
_TEMP_SUFFIX = ".tmp"


class _NameConflict(Exception):
    """Every number tried was taken while the result waited to be published."""


def name_prefix_for(preset: str, name_prefix: str) -> str:
    return name_prefix.strip() or preset


def _source_file(source: Mapping[str, object]) -> tuple[Path, str]:
    """The media file and output node of an embedded workflow, refusing what cannot carry one."""
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


def _load_generation(preset: str, source: Mapping[str, object] | None) -> ComfyWorkflow:
    """The preset, or the file's own workflow, checked to be a generation."""
    if source is not None:
        if preset.strip():
            raise ValueError("Run either a preset or a file's workflow, not both.")
        workflow = load_embedded_generation(*_source_file(source))
    else:
        workflow = load_comfy_workflow(preset)
    require_generation(workflow)
    return workflow


def _default_prefix(preset: str, workflow: ComfyWorkflow, source: object) -> str:
    """The preset's name, or the source file's stem without the separator ComfyUI ends it with."""
    if source is None:
        return preset
    return workflow.preset.rstrip("_ .") or "generated"


def _validate_name_prefix(prefix: str) -> None:
    if not prefix:
        raise ValueError("Choose a file name prefix.")
    if len(prefix) > MAX_COMFY_GENERATE_PREFIX_LENGTH:
        raise ValueError(
            f"The file name prefix can be at most {MAX_COMFY_GENERATE_PREFIX_LENGTH} characters."
        )
    if _UNSAFE_NAME.search(prefix) or prefix.startswith(".") or prefix.endswith((".", " ")):
        raise ValueError(
            'The file name prefix cannot contain < > : " / \\ | ? *, start with a dot, or end '
            "with a dot or space."
        )


def validate_comfy_generate_folder(
    folder: Path,
    *,
    preset: str = "",
    prompt_text: str = "",
    inputs: Mapping[str, object] | None = None,
    name_prefix: str = "",
    source: Mapping[str, object] | None = None,
) -> ComfyWorkflow:
    """Refuse at queue time what would fail on the first run. Does not probe ComfyUI."""
    if not folder.is_dir():
        raise ValueError(f"Folder not found: {folder}")

    if folder.name == STAGING_DIR_NAME:
        raise ValueError(
            "This is a staging folder, which holds candidates for review. Generate into the "
            "dataset folder above it instead."
        )

    try:
        workflow = _load_generation(preset, source)
        resolve_custom_inputs(workflow, inputs or {})
    except ComfyWorkflowError as exc:
        # ValueError is a 400; ComfyWorkflowError would escape the route as a 500.
        raise ValueError(str(exc)) from exc

    if prompt_text.strip() and workflow.prompt_node is None:
        raise ValueError(
            f'The preset "{workflow.preset}" has no node titled "{PROMPT_NODE_TITLE}", so there '
            f"is nowhere to put a prompt. Title one in ComfyUI and re-export it, or clear the "
            f"prompt to run the workflow as saved."
        )

    _validate_name_prefix(name_prefix_for(_default_prefix(preset, workflow, source), name_prefix))
    return workflow


def _numbered_name(prefix: str) -> re.Pattern[str]:
    """``<prefix>_<digits>`` followed by an extension or nothing, so sidecars count too."""
    return re.compile(rf"^{re.escape(prefix)}_(\d+)(?:\.|$)", re.IGNORECASE)


def _next_number(folder: Path, prefix: str) -> int:
    """One past the highest number the prefix has used, so a re-run continues the series."""
    pattern = _numbered_name(prefix)
    highest = 0
    with suppress(OSError):
        for entry in folder.iterdir():
            match = pattern.match(entry.name)
            if match:
                highest = max(highest, int(match.group(1)))
    return highest + 1


def _name_is_free(folder: Path, prefix: str, number: int) -> bool:
    """No file of that stem at all: a leftover caption would otherwise pair with new pixels."""
    stem = f"{prefix}_{number:0{NUMBER_WIDTH}d}".lower()
    with suppress(OSError):
        for entry in folder.iterdir():
            if entry.name.lower() == stem or entry.name.lower().startswith(f"{stem}."):
                return False
    return True


def _check_output(temp_path: Path, suffix: str) -> None:
    """Refuse what would not open in the gallery before it gets a name there."""
    if suffix in MOTION_EXTENSIONS:
        try:
            validate_candidate_media(temp_path, suffix=suffix)
        except ValueError as error:
            raise ComfyError(str(error)) from error
        return

    try:
        with Image.open(temp_path) as opened:
            opened.load()
    except (OSError, UnidentifiedImageError) as exc:
        raise ComfyError(f"ComfyUI returned something that is not an image: {exc}") from exc


def _publish(temp_path: Path, folder: Path, prefix: str, suffix: str, first: int) -> Path:
    """Give the file the first free number from ``first``, never replacing an existing file."""
    number = first
    for _ in range(1000):
        if _name_is_free(folder, prefix, number):
            destination = folder / f"{prefix}_{number:0{NUMBER_WIDTH}d}{suffix}"
            with claim([destination], "generate"):
                if publish_new_file(temp_path, destination):
                    return destination
        number += 1
    raise _NameConflict(f'No free file name was found after "{prefix}_{first:0{NUMBER_WIDTH}d}".')


class _Generator:
    """One job's state: the client, the numbering and the results so far."""

    def __init__(
        self,
        folder: Path,
        workflow: ComfyWorkflow,
        *,
        prefix: str,
        prompt_text: str,
        custom_values: dict[str, ComfyInputValue],
        caption_text: str | None,
        should_cancel: ShouldCancel | None,
    ) -> None:
        self.folder = folder
        self.workflow = workflow
        self.prefix = prefix
        self.prompt_text = prompt_text
        self.custom_values = custom_values
        self.caption_text = caption_text
        self.should_cancel = should_cancel
        self.job_tag = uuid.uuid4().hex[:8]
        self.client_id = uuid.uuid4().hex
        self.next_number = _next_number(folder, prefix)
        #: Why a published file got no caption, by path; the file itself still counts.
        self.caption_failures: dict[Path, str] = {}
        output_class = workflow.prompt[workflow.output_node]["class_type"]
        self.timeout = get_comfy_media_timeout(
            "image" if output_class in _STILL_OUTPUT_CLASSES else "video"
        )

    def run_once(
        self, client: httpx.Client, index: int, seed: int | None, written: list[Path]
    ) -> None:
        """One prompt, with every file its output node wrote published under a new name.

        Files land in ``written`` as they are published, so a failure later in a batch still
        reports the ones already in the folder.
        """
        prompt = build_comfy_prompt(
            self.workflow,
            media_ref=None,
            filename_prefix=f"DataForge/{self.job_tag}/{self.prefix}_{index:05d}",
            seed=seed,
            # Empty box means run the graph as saved, not write "" into the prompt node.
            prompt_text=self.prompt_text or None,
            custom_values=self.custom_values,
        )

        with gpu_slot(self.should_cancel):
            prompt_id = submit_prompt(client, prompt, client_id=self.client_id)
            refs = await_outputs(
                client,
                prompt_id,
                output_node=self.workflow.output_node,
                timeout=self.timeout,
                should_cancel=self.should_cancel,
            )

            # Checked for the whole batch first, so a bad format writes none of it.
            suffixes = [Path(ref["filename"]).suffix.lower() for ref in refs]
            for suffix in suffixes:
                if suffix not in COMFY_CANDIDATE_SUFFIXES:
                    allowed = ", ".join(COMFY_CANDIDATE_SUFFIXES)
                    raise ComfyError(
                        f'The workflow returned a "{suffix}" file, which DataForge does not '
                        f"save. Set the output node's format to one of {allowed}."
                    )

            for ref, suffix in zip(refs, suffixes, strict=True):
                written.append(self._save(client, ref, suffix))

    def _save(self, client: httpx.Client, ref: dict[str, str], suffix: str) -> Path:
        descriptor, name = tempfile.mkstemp(
            prefix=_TEMP_PREFIX, suffix=_TEMP_SUFFIX, dir=self.folder
        )
        os.close(descriptor)
        temp_path = Path(name)
        try:
            download_view_to(client, ref, temp_path)
            _check_output(temp_path, suffix)
            destination = _publish(temp_path, self.folder, self.prefix, suffix, self.next_number)
        finally:
            with suppress(OSError):
                temp_path.unlink(missing_ok=True)

        self.next_number = int(destination.stem.rsplit("_", 1)[1]) + 1
        if self.caption_text:
            try:
                save_caption(destination, self.caption_text, base_revision=None)
            except (CaptionConflictError, OSError) as exc:
                self.caption_failures[destination] = f"No caption written: {exc}"
        return destination


def _sweep_temp_files(folder: Path) -> None:
    """Downloads a hard kill left behind. One job runs per folder, so none is in use now."""
    with suppress(OSError):
        for leftover in folder.glob(f"{_TEMP_PREFIX}*{_TEMP_SUFFIX}"):
            with suppress(OSError):
                leftover.unlink()


def _caption_text(workflow: ComfyWorkflow, prompt_text: str) -> str | None:
    """What the run was prompted with: the entered text, else what the preset was saved with."""
    text = prompt_text or (workflow.saved_prompt_text or "")
    return text.strip() or None


def _seed_for(base: int | None, index: int, has_seed_nodes: bool) -> int | None:
    """A fresh random seed per run, or the entered one counting up, so a run is repeatable."""
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
    del selected_paths  # Generation reads no files, so the selection has nothing to narrow.
    # Loaded once more here: the preset or the file may have changed while the job queued.
    workflow = validate_comfy_generate_folder(
        folder,
        preset=preset,
        prompt_text=prompt_text,
        inputs=inputs,
        name_prefix=name_prefix,
        source=source,
    )
    prompt_text = prompt_text.strip()
    _sweep_temp_files(folder)
    generator = _Generator(
        folder,
        workflow,
        prefix=name_prefix_for(_default_prefix(preset, workflow, source), name_prefix),
        prompt_text=prompt_text,
        custom_values=resolve_custom_inputs(workflow, inputs or {}),
        caption_text=_caption_text(workflow, prompt_text) if caption_from_prompt else None,
        should_cancel=should_cancel,
    )

    stats: dict[str, int] = {"total": count}
    results: list[dict[str, object]] = []

    def report(index: int, done: int) -> None:
        if on_progress:
            on_progress(str(folder), f"Generation {index} of {count}", done, count, dict(stats))

    def failed(index: int, status: str, message: object) -> None:
        stats[status] = stats.get(status, 0) + 1
        # No file exists for a failed run; the pseudo path only keeps rows distinct.
        results.append(
            {
                "path": str(folder / f"generation-{generator.job_tag}-{index}"),
                "name": f"Generation {index}",
                "status": status,
                "message": str(message),
            }
        )

    client = open_comfy_client(COMFY_TRANSFER_TIMEOUT_SECONDS)
    try:
        for index in range(1, count + 1):
            if should_cancel and should_cancel():
                stats[CANCELLED] = count - index + 1
                break

            report(index, index - 1)
            run_seed = _seed_for(seed, index - 1, bool(workflow.seed_nodes))
            written: list[Path] = []
            failure: tuple[str, object] | None = None
            stop = False
            try:
                generator.run_once(client, index, run_seed, written)
            except ComfyRunCancelled:
                stop = True
            except ComfyUnavailableError as exc:
                failure = ("comfy_error", f"ComfyUI is not reachable: {exc}")
            except ComfyError as exc:
                failure = ("comfy_error", exc)
            except (OSError, _NameConflict) as exc:
                failure = ("write_error", exc)

            for path in written:
                notes = [
                    note
                    for note in (
                        f"Seed {run_seed}" if run_seed is not None else None,
                        generator.caption_failures.get(path),
                    )
                    if note
                ]
                results.append(
                    {
                        "path": str(path),
                        "name": path.name,
                        "status": "success",
                        "preview": str(path),
                        **({"message": ". ".join(notes)} if notes else {}),
                    }
                )

            if stop:
                stats[CANCELLED] = count - index + 1
                break
            if failure is not None:
                failed(index, *failure)
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
