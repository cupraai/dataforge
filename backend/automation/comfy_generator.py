"""Runs ComfyUI workflows that make new files, for Generate and showcases."""

from __future__ import annotations

import re
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

from automation.job_runner import CANCELLED, ShouldCancel
from captions import CaptionConflictError, save_caption
from comfy_settings import get_comfy_media_timeout
from constants import (
    COMFY_CANDIDATE_SUFFIXES,
    MAX_COMFY_GENERATE_PREFIX_LENGTH,
    MOTION_EXTENSIONS,
    STAGING_DIR_NAME,
)
from external.comfy_client import (
    ComfyError,
    ComfyUnavailableError,
    download_view_to,
    submit_prompt,
)
from external.comfy_execution import ComfyRunCancelled, await_outputs, gpu_slot
from external.comfy_lora_chain import LoraRef, with_loras
from external.comfy_workflows import ComfyWorkflow, build_comfy_prompt
from numbered_files import (
    NameConflict,
    next_number,
    number_of,
    publish_numbered,
    temporary_file,
)
from schemas import ComfyInputValue
from video_frames import validate_candidate_media

# Omit ``cancelled`` and a cancelled run looks complete.
PROCESSED_STAT_KEYS = ("success", "comfy_error", "write_error")

#: Same range as the editor's fills.
SEED_LIMIT = 2**32

#: Anything else may write a clip and gets the video timeout.
_STILL_OUTPUT_CLASSES = frozenset({"SaveImage", "PreviewImage", "SaveImageWebsocket"})

#: Characters Windows refuses in a name.
_UNSAFE_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def name_prefix_for(preset: str, name_prefix: str) -> str:
    return name_prefix.strip() or preset


def validate_name_prefix(prefix: str) -> None:
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


def refuse_staging_folder(folder: Path) -> None:
    if not folder.is_dir():
        raise ValueError(f"Folder not found: {folder}")
    if folder.name == STAGING_DIR_NAME:
        raise ValueError(
            "This is a staging folder, which holds candidates for review. Generate into the "
            "dataset folder above it instead."
        )


def _check_output(temp_path: Path, suffix: str) -> None:
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


@dataclass(frozen=True)
class GenerationRun:
    """What one submission writes into the graph."""

    #: Empty runs the graph's saved prompt.
    prompt_text: str
    custom_values: Mapping[str, ComfyInputValue]
    #: Written beside every file it makes; None writes none.
    caption_text: str | None
    seed: int | None
    #: The uploaded start file, for a preset with a source loader.
    media_ref: str | None = None
    loras: tuple[LoraRef, ...] = ()
    model_outputs: Mapping[str, int] = field(default_factory=dict)
    #: Runs instead of the generator's own, with the same output node.
    workflow: ComfyWorkflow | None = None


@dataclass
class RunOutcome:
    #: Published before any failure, so they are reported too.
    written: list[Path]
    #: ``success``, ``cancelled`` or a failure stat key.
    status: str
    message: str | None = None


class Generator:
    """Submits runs of one workflow and publishes what each writes, numbered in order."""

    def __init__(
        self,
        folder: Path,
        workflow: ComfyWorkflow,
        *,
        prefix: str,
        should_cancel: ShouldCancel | None,
    ) -> None:
        self.folder = folder
        self.workflow = workflow
        self.prefix = prefix
        self.should_cancel = should_cancel
        self.job_tag = uuid.uuid4().hex[:8]
        self.client_id = uuid.uuid4().hex
        self.next_number = next_number(folder, prefix)
        #: Why a published file got no caption, by path.
        self.caption_failures: dict[Path, str] = {}
        output_class = workflow.prompt[workflow.output_node]["class_type"]
        self.timeout = get_comfy_media_timeout(
            "image" if output_class in _STILL_OUTPUT_CLASSES else "video"
        )

    def build_prompt(self, index: int, run: GenerationRun) -> dict[str, object]:
        workflow = run.workflow or self.workflow
        prompt = build_comfy_prompt(
            workflow,
            media_ref=run.media_ref,
            filename_prefix=f"DataForge/{self.job_tag}/{self.prefix}_{index:05d}",
            seed=run.seed,
            # Empty means run the graph as saved.
            prompt_text=run.prompt_text or None,
            custom_values=run.custom_values,
        )
        return with_loras(workflow, prompt, run.loras, run.model_outputs)

    def run_once(
        self, client: httpx.Client, index: int, run: GenerationRun, written: list[Path]
    ) -> None:
        """Files land in ``written`` as published, so a later failure still reports them."""
        prompt = self.build_prompt(index, run)

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
                written.append(self._save(client, ref, suffix, run.caption_text))

    def _save(
        self, client: httpx.Client, ref: dict[str, str], suffix: str, caption_text: str | None
    ) -> Path:
        with temporary_file(self.folder) as temp_path:
            download_view_to(client, ref, temp_path)
            _check_output(temp_path, suffix)
            destination = publish_numbered(
                temp_path, self.folder, self.prefix, suffix, self.next_number, "generate"
            )

        self.next_number = number_of(destination) + 1
        if caption_text:
            try:
                save_caption(destination, caption_text, base_revision=None)
            except (CaptionConflictError, OSError) as exc:
                self.caption_failures[destination] = f"No caption written: {exc}"
        return destination

    def attempt(self, client: httpx.Client, index: int, run: GenerationRun) -> RunOutcome:
        """One run, its failure caught and classified."""
        written: list[Path] = []
        try:
            self.run_once(client, index, run, written)
        except ComfyRunCancelled:
            return RunOutcome(written, CANCELLED)
        except ComfyUnavailableError as exc:
            return RunOutcome(written, "comfy_error", f"ComfyUI is not reachable: {exc}")
        except ComfyError as exc:
            return RunOutcome(written, "comfy_error", str(exc))
        except (OSError, NameConflict) as exc:
            return RunOutcome(written, "write_error", str(exc))
        return RunOutcome(written, "success")

    def success_row(self, path: Path, notes: list[str | None]) -> dict[str, object]:
        """``notes`` join into the message, with any caption failure last."""
        message = ". ".join(note for note in (*notes, self.caption_failures.get(path)) if note)
        return {
            "path": str(path),
            "name": path.name,
            "status": "success",
            "preview": str(path),
            **({"message": message} if message else {}),
        }

    def failure_row(self, index: int, name: str, status: str, message: object) -> dict[str, object]:
        # The pseudo path only keeps rows distinct.
        return {
            "path": str(self.folder / f"generation-{self.job_tag}-{index}"),
            "name": name,
            "status": status,
            "message": str(message),
        }


def caption_text_for(workflow: ComfyWorkflow, prompt_text: str) -> str | None:
    """The entered text, else what the preset was saved with."""
    text = prompt_text or (workflow.saved_prompt_text or "")
    return text.strip() or None
