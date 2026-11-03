"""Generate one fill in the background, through the same ComfyUI slot the prep job uses.

Operations live in memory only. A generation belongs to the editor session that started it, its
result is a draft until Apply, and a restart answers 404 for an id it no longer knows: the editor
reports that as interrupted rather than resuming a ComfyUI prompt nothing tracks anymore.

The source is read under a brief media claim and never held across the model wait, so the file
can still be renamed, deleted or edited meanwhile. The result is bound to the original's digest
and its parent fill, and Apply checks both again before it uses the pixels.
"""

from __future__ import annotations

import logging
import secrets
import shutil
import tempfile
import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from api_errors import ConflictError
from comfy_settings import get_comfy_image_timeout, get_fill_settings
from edit_sidecars import original_path_for
from external.comfy_client import (
    COMFY_TRANSFER_TIMEOUT_SECONDS,
    ComfyError,
    ComfyUnavailableError,
    download_view_to,
    open_comfy_client,
    submit_prompt,
    upload_media,
)
from external.comfy_execution import ComfyRunCancelled, await_output, gpu_slot
from external.comfy_workflows import ComfyWorkflowError
from image_fill import (
    FillAsset,
    FillInputs,
    FillOutputError,
    apply_fill_chain,
    decode_mask,
    file_digest,
    generated_patch,
    prepare_fill_inputs,
    resolve_fill_chain,
    save_result,
    sweep_results,
)
from image_fill_workflow import (
    FillTemplate,
    build_fill_prompt,
    fill_prompt_text,
    load_fill_template,
)
from image_io import load_image_for_edit
from media_claims import claim
from schemas import (
    FillOperationStatus,
    FillPreset,
    ImageFill,
    ImageFillOperationResponse,
    ImageFillRequest,
)

logger = logging.getLogger(__name__)

#: Every generation waits for one GPU slot, so a deeper queue only delays the newest click.
MAX_ACTIVE_FILL_OPERATIONS = 4
#: Finished operations are remembered for a late poll, then the oldest are forgotten.
MAX_REMEMBERED_FILL_OPERATIONS = 32

_TERMINAL: frozenset[FillOperationStatus] = frozenset({"succeeded", "failed", "cancelled"})

#: Seeds stay within what a browser number holds exactly.
_SEED_LIMIT = 2**32


class FillInProgressError(ConflictError):
    code = "media_busy"


@dataclass
class FillOperation:
    id: str
    media: Path
    preset: FillPreset
    status: FillOperationStatus = "waiting"
    error: str | None = None
    fill: ImageFill | None = None
    cancel_requested: threading.Event = field(default_factory=threading.Event)

    @property
    def finished(self) -> bool:
        return self.status in _TERMINAL

    def describe(self) -> ImageFillOperationResponse:
        return ImageFillOperationResponse(
            id=self.id,
            path=str(self.media),
            status=self.status,
            preset=self.preset,
            error=self.error,
            fill=self.fill,
        )


@dataclass(frozen=True)
class _Job:
    operation: FillOperation
    template: FillTemplate
    inputs: FillInputs
    fill: ImageFill


_lock = threading.Lock()
_operations: OrderedDict[str, FillOperation] = OrderedDict()


def _active() -> list[FillOperation]:
    return [operation for operation in _operations.values() if not operation.finished]


def _remember(operation: FillOperation) -> None:
    _operations[operation.id] = operation
    finished = [op_id for op_id, op in _operations.items() if op.finished]
    while len(_operations) > MAX_REMEMBERED_FILL_OPERATIONS and finished:
        _operations.pop(finished.pop(0), None)


def get_fill_operation(operation_id: str) -> FillOperation | None:
    with _lock:
        return _operations.get(operation_id)


def cancel_fill_operation(operation_id: str) -> FillOperation | None:
    """Ask a generation to stop; quiet when it already finished."""
    with _lock:
        operation = _operations.get(operation_id)
    if operation is not None and not operation.finished:
        operation.cancel_requested.set()
    return operation


def _set_status(operation: FillOperation, status: FillOperationStatus, **changes: object) -> None:
    with _lock:
        if operation.finished:
            return
        operation.status = status
        for key, value in changes.items():
            setattr(operation, key, value)


def _reserve(media: Path, preset: FillPreset) -> FillOperation:
    with _lock:
        active = _active()
        if any(operation.media == media for operation in active):
            raise FillInProgressError(
                f"A fill is already generating for {media.name}. Wait for it or cancel it."
            )
        if len(active) >= MAX_ACTIVE_FILL_OPERATIONS:
            raise FillInProgressError(
                "Too many fills are waiting for ComfyUI. Try again when one finishes."
            )
        operation = FillOperation(id=secrets.token_hex(16), media=media, preset=preset)
        _remember(operation)
    return operation


def _forget(operation: FillOperation) -> None:
    with _lock:
        _operations.pop(operation.id, None)


def start_fill(media: Path, request: ImageFillRequest) -> FillOperation:
    """Snapshot the source, plan the crop and queue the generation. Raises before queueing."""
    template = load_fill_template(request.preset)
    operation = _reserve(media, request.preset)
    try:
        with _lock:
            active_ids = {op.id for op in _active()}
        sweep_results(active_ids)

        with claim([media], "fill"):
            source = original_path_for(media)
            image, _, _ = load_image_for_edit(source)
            digest = file_digest(source)
            chain = resolve_fill_chain(media, request.fills, digest)
            base = apply_fill_chain(image, chain)

        inputs = prepare_fill_inputs(base, decode_mask(request.mask_png, base.size))
    except BaseException:
        _forget(operation)
        raise

    seed = request.seed if request.seed is not None else secrets.randbelow(_SEED_LIMIT)
    geometry = inputs.geometry
    fill = ImageFill(
        id=operation.id,
        parent_id=request.fills[-1].id if request.fills else None,
        source_digest=digest,
        box=geometry.box,
        inference_width=geometry.inference_width,
        inference_height=geometry.inference_height,
        instruction=request.instruction.strip(),
        preset=request.preset,
        seed=seed,
        workflow=template.identity,
        created_at=datetime.now(tz=UTC).isoformat(),
    )

    job = _Job(operation=operation, template=template, inputs=inputs, fill=fill)
    threading.Thread(
        target=_run, args=(job,), name=f"image-fill-{operation.id[:8]}", daemon=True
    ).start()
    return operation


def _write_png(image: Image.Image, path: Path) -> None:
    image.save(path, format="PNG", compress_level=1)


def _decoded_output(path: Path) -> Image.Image:
    try:
        with Image.open(path) as opened:
            opened.load()
            return opened.copy()
    except (OSError, UnidentifiedImageError) as error:
        raise FillOutputError(
            f"ComfyUI returned something that is not an image: {error}"
        ) from error


def _generate(job: _Job, work: Path) -> FillAsset:
    operation = job.operation
    should_cancel = operation.cancel_requested.is_set
    settings = get_fill_settings()
    tag = operation.id[:12]

    image_path = work / f"fill_{tag}.png"
    mask_path = work / f"fill_{tag}_mask.png"
    _write_png(job.inputs.model_image, image_path)
    _write_png(job.inputs.model_mask, mask_path)

    with open_comfy_client(COMFY_TRANSFER_TIMEOUT_SECONDS) as client:
        image_ref = upload_media(client, image_path, name=image_path.name)
        mask_ref = upload_media(client, mask_path, name=mask_path.name)
        prompt = build_fill_prompt(
            job.template,
            image_ref=image_ref,
            mask_ref=mask_ref,
            prompt_text=fill_prompt_text(job.fill.instruction),
            seed=job.fill.seed,
            filename_prefix=f"DataForge/fill/{tag}",
            settings=settings,
        )

        with gpu_slot(should_cancel):
            if should_cancel():
                raise ComfyRunCancelled
            prompt_id = submit_prompt(client, prompt, client_id=operation.id)
            _set_status(operation, "queued")
            ref = await_output(
                client,
                prompt_id,
                output_node=job.template.workflow.output_node,
                timeout=get_comfy_image_timeout(),
                should_cancel=should_cancel,
                on_running=lambda: _set_status(operation, "running"),
            )
            output_path = work / "output.png"
            download_view_to(client, ref, output_path)

    patch = generated_patch(_decoded_output(output_path), job.inputs)
    return FillAsset(fill=job.fill, generated=patch, blend=job.inputs.blend)


def _run(job: _Job) -> None:
    operation = job.operation
    work = Path(tempfile.mkdtemp(prefix="dataforge-fill-"))
    try:
        asset = _generate(job, work)
        save_result(operation.media, asset)
    except ComfyRunCancelled:
        _set_status(operation, "cancelled")
    except ComfyUnavailableError as error:
        _set_status(operation, "failed", error=f"ComfyUI is not reachable: {error}")
    except (ComfyError, ComfyWorkflowError, FillOutputError) as error:
        _set_status(operation, "failed", error=str(error))
    except OSError as error:
        _set_status(operation, "failed", error=f"Could not store the result: {error}")
    except Exception as error:
        logger.exception("Fill %s failed", operation.id)
        _set_status(operation, "failed", error=str(error) or type(error).__name__)
    else:
        # A cancel that lost the race to a finished render still gets its answer: the pixels
        # are stored and the editor decides whether to show them.
        _set_status(operation, "succeeded", fill=asset.fill)
    finally:
        shutil.rmtree(work, ignore_errors=True)
