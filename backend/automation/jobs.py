"""Background jobs with SQLite-backed progress tracking.

Each folder runs one job at a time; a job started while another is active for the folder waits in
that folder's queue and starts when the one before it completes. A job that fails, is cancelled,
is interrupted or leaves failed files cancels everything queued behind it, since later steps
usually build on its output. Different folders run side by side.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Sequence
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic
from typing import get_args

import events
import notifications
from api_errors import ConflictError
from automation import job_outcome, jobs_store
from automation.auto_adjust import run_auto_adjust_job, validate_auto_adjust_folder
from automation.auto_caption import run_auto_caption_job, validate_auto_caption_folder
from automation.backup_captions import (
    run_backup_captions_job,
    run_restore_captions_job,
    validate_backup_captions_folder,
    validate_restore_captions_folder,
)
from automation.caption_undo import undo_caption_writes, undo_records
from automation.check_caption_rules import (
    run_check_caption_rules_job,
    validate_check_caption_rules_folder,
)
from automation.comfy_process import run_comfy_process_job, validate_comfy_process_folder
from automation.edit_captions import run_edit_captions_job, validate_edit_captions_folder
from automation.find_duplicates import (
    DEFAULT_THRESHOLD as DEFAULT_DUPLICATE_THRESHOLD,
)
from automation.find_duplicates import (
    run_find_duplicates_job,
    validate_find_duplicates_folder,
)
from automation.job_messages import (
    auto_adjust_error_message,
    auto_caption_failure_message,
    backup_captions_error_message,
    check_caption_rules_error_message,
    comfy_process_error_message,
    edit_captions_failure_message,
    find_duplicates_error_message,
    rename_media_error_message,
    replace_captions_error_message,
    resize_error_message,
    restore_captions_error_message,
    set_captions_error_message,
    split_video_error_message,
    strip_metadata_error_message,
    verify_captions_failure_message,
    watermark_error_message,
)
from automation.job_runner import ProgressCallback
from automation.rename_media import (
    normalize_start_number,
    run_rename_media_job,
    validate_rename_media_folder,
)
from automation.replace_captions import (
    DEFAULT_MODE as DEFAULT_REPLACE_MODE,
)
from automation.replace_captions import (
    run_replace_captions_job,
    validate_replace_captions_folder,
)
from automation.resize import run_resize_job, validate_resize_folder
from automation.set_captions import run_set_captions_job, validate_set_captions_folder
from automation.split_video import run_split_video_job, validate_split_video_folder
from automation.strip_metadata import run_strip_metadata_job, validate_strip_metadata_folder
from automation.train_lora import run_train_lora_job, validate_train_lora_folder
from automation.verify_captions import run_verify_captions_job, validate_verify_captions_folder
from automation.watermark import (
    DEFAULT_WATERMARK_IMAGE_OPACITY,
    DEFAULT_WATERMARK_IMAGE_POSITION,
    DEFAULT_WATERMARK_IMAGE_SIZE,
    DEFAULT_WATERMARK_OPACITY,
    DEFAULT_WATERMARK_POSITION,
    DEFAULT_WATERMARK_SIZE,
    run_watermark_job,
    validate_watermark_folder,
)
from external.ostris_training import DEFAULT_TRAINING_MODEL
from filesystem import normalize_user_path, path_leaf_name
from path_resolve import resolve_path
from revisions import next_revision
from schemas import JobEvent, JobHistoryStatus, JobsRemovedEvent, JobStatus, JobType

ACTIVE_STATUSES = frozenset({"queued", "running"})

# Derived from the aliases rather than restated, so a new status cannot be valid in one place only.
JOB_STATUSES: tuple[JobStatus, ...] = get_args(JobStatus.__value__)
JOB_TYPES: tuple[JobType, ...] = get_args(JobType.__value__)

# Mid-run frames are stored and pushed at most this often; a status change always goes out.
JOB_EVENT_MIN_INTERVAL_SECONDS = 0.25


class JobUndoError(ConflictError):
    code = "job_undo_unavailable"


def _utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def _stored_text(data: dict[str, object], key: str) -> str | None:
    value = data.get(key)
    return value if isinstance(value, str) else None


def _stored_int(data: dict[str, object], key: str) -> int:
    value = data.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _stored_literal[T: str](data: dict[str, object], key: str, allowed: tuple[T, ...]) -> T:
    value = data.get(key)
    # Returns the member itself: a comparison narrows nothing, so `value` stays a plain str.
    for option in allowed:
        if value == option:
            return option
    raise ValueError(f"Stored job {data.get('id')} has an unknown {key}: {value!r}")


@dataclass
class Job:
    id: str
    folder: str
    status: JobStatus = "queued"
    total: int = 0
    processed: int = 0
    current_file: str | None = None
    current_name: str | None = None
    stats: dict[str, int] = field(default_factory=dict)
    results: list[dict[str, object]] = field(default_factory=list)
    error: str | None = None
    created_at: str = field(default_factory=_utc_now)
    started_at: str | None = None
    finished_at: str | None = None
    job_type: JobType = "auto_caption"
    auto_caption_mode: str | None = None
    external_ref: str | None = None
    #: The ComfyUI preset or training model the run used; null for types without one.
    workflow: str | None = None
    #: A training run started from an edited template rather than the shipped one.
    workflow_edited: bool = False
    #: Stamped on every change, so a client can tell which of two copies is newer.
    revision: int = 0
    #: Its caption writes can still be taken back; computed by the store, never a column.
    undoable: bool = False

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> Job:
        """Rebuild a job from its stored row; a column of the wrong shape falls back to its default."""
        stats = data.get("stats") or {}
        results = data.get("results") or []
        return cls(
            id=str(data["id"]),
            folder=str(data["folder"]),
            status=_stored_literal(data, "status", JOB_STATUSES),
            total=_stored_int(data, "total"),
            processed=_stored_int(data, "processed"),
            current_file=_stored_text(data, "current_file"),
            current_name=_stored_text(data, "current_name"),
            stats=dict(stats) if isinstance(stats, dict) else {},
            results=list(results) if isinstance(results, list) else [],
            error=_stored_text(data, "error"),
            created_at=str(data["created_at"]),
            started_at=_stored_text(data, "started_at"),
            finished_at=_stored_text(data, "finished_at"),
            job_type=_stored_literal(data, "job_type", JOB_TYPES),
            auto_caption_mode=_stored_text(data, "auto_caption_mode"),
            external_ref=_stored_text(data, "external_ref"),
            workflow=_stored_text(data, "workflow"),
            workflow_edited=data.get("workflow_edited") is True,
            revision=_stored_int(data, "revision"),
            undoable=data.get("undoable") is True,
        )

    def to_summary_dict(self) -> dict[str, object]:
        """Everything about the job except its per-file results."""
        return {
            "id": self.id,
            "folder": self.folder,
            "folder_name": path_leaf_name(self.folder),
            "job_type": self.job_type,
            "status": self.status,
            "total": self.total,
            "processed": self.processed,
            "current_file": self.current_file,
            "current_name": self.current_name,
            "stats": self.stats,
            "error": self.error or JOB_SPECS[self.job_type].failure(self.stats),
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "auto_caption_mode": self.auto_caption_mode,
            "external_ref": self.external_ref,
            "workflow": self.workflow,
            "workflow_edited": self.workflow_edited,
            "revision": self.revision,
            "undoable": self.undoable,
        }

    def to_dict(self) -> dict[str, object]:
        """The persistence shape: the summary plus the per-file results."""
        return {**self.to_summary_dict(), "results": self.results}


def _folder_only(validate: Callable[[Path], None]) -> Callable[..., None]:
    """Adapt a plain folder validator to the ``(folder, **params)`` spec signature."""

    def validate_folder(folder: Path, **_params: object) -> None:
        validate(folder)

    return validate_folder


def _selected_paths(params: dict[str, object]) -> list[Path] | None:
    selected = params.get("selected_paths")
    return selected if isinstance(selected, list) else None


def _validate_rename_media(folder: Path, **params: object) -> None:
    validate_rename_media_folder(
        folder,
        stem=str(params.get("stem", "")),
        start_number=normalize_start_number(params.get("start_number", 1)),
        selected_paths=_selected_paths(params),
    )


def _validate_replace_captions(folder: Path, **params: object) -> None:
    validate_replace_captions_folder(
        folder,
        mode=str(params.get("mode", DEFAULT_REPLACE_MODE)),
        search=str(params.get("search", "")),
        replacement=str(params.get("replacement", "")),
        use_regex=bool(params.get("use_regex", False)),
        case_sensitive=bool(params.get("case_sensitive", False)),
    )


def _validate_find_duplicates(folder: Path, **params: object) -> None:
    validate_find_duplicates_folder(
        folder,
        threshold=str(params.get("threshold", DEFAULT_DUPLICATE_THRESHOLD)),
    )


def _validate_watermark(folder: Path, **params: object) -> None:
    validate_watermark_folder(
        folder,
        text_enabled=params.get("text_enabled", True) is not False,
        text=str(params.get("text", "")),
        size=str(params.get("size", DEFAULT_WATERMARK_SIZE)),
        opacity=_stored_int(params, "opacity") or DEFAULT_WATERMARK_OPACITY,
        position=str(params.get("position", DEFAULT_WATERMARK_POSITION)),
        image_enabled=params.get("image_enabled") is True,
        image_size=str(params.get("image_size", DEFAULT_WATERMARK_IMAGE_SIZE)),
        image_opacity=_stored_int(params, "image_opacity") or DEFAULT_WATERMARK_IMAGE_OPACITY,
        image_position=str(params.get("image_position", DEFAULT_WATERMARK_IMAGE_POSITION)),
        selected_paths=_selected_paths(params),
    )


def _validate_auto_adjust(folder: Path, **params: object) -> None:
    validate_auto_adjust_folder(folder, _selected_paths(params))


def _validate_resize(folder: Path, **params: object) -> None:
    validate_resize_folder(folder, _selected_paths(params))


def _validate_split_video(folder: Path, **params: object) -> None:
    validate_split_video_folder(folder, _selected_paths(params))


def _comfy_inputs(params: dict[str, object]) -> dict[str, object]:
    inputs = params.get("inputs")
    return {str(name): value for name, value in inputs.items()} if isinstance(inputs, dict) else {}


def _validate_comfy_process(folder: Path, **params: object) -> None:
    validate_comfy_process_folder(
        folder,
        preset=str(params.get("preset", "")),
        prompt_text=str(params.get("prompt_text", "")),
        inputs=_comfy_inputs(params),
        selected_paths=_selected_paths(params),
    )


def _train_lora_external_ref(params: dict[str, object]) -> str | None:
    return str(params.get("lora_name", "")).strip() or None


def _resume_train_lora(job: Job) -> dict[str, object] | None:
    if not job.external_ref:
        return None
    return {"lora_name": job.external_ref, "attach_only": True}


def _comfy_workflow(params: dict[str, object]) -> tuple[str | None, bool]:
    return str(params.get("preset", "")).strip() or None, False


def _train_lora_workflow(params: dict[str, object]) -> tuple[str | None, bool]:
    model = str(params.get("model") or DEFAULT_TRAINING_MODEL)
    return model, params.get("template") is not None


def _auto_caption_mode(params: dict[str, object]) -> str | None:
    return str(params.get("mode", "thinking"))


def _edit_captions_mode(params: dict[str, object]) -> str | None:
    return str(params.get("mode", "instruct"))


def _validate_edit_captions(folder: Path, **params: object) -> None:
    validate_edit_captions_folder(folder, instruction=str(params.get("instruction", "")))


def _validate_auto_caption(folder: Path, **params: object) -> None:
    validate_auto_caption_folder(folder, caption_audio=bool(params.get("caption_audio", False)))


@dataclass(frozen=True)
class JobSpec:
    """Everything that differs between job types; ``resume`` is only for work that outlives this process."""

    thread_prefix: str
    run: Callable[..., dict[str, object]]
    validate: Callable[..., None]
    failure_message: Callable[[dict[str, int]], str | None] | None = None
    resume: Callable[[Job], dict[str, object] | None] | None = None
    external_ref: Callable[[dict[str, object]], str | None] | None = None
    caption_mode: Callable[[dict[str, object]], str | None] | None = None
    #: What the run was built from, and whether it was edited for this run only.
    workflow: Callable[[dict[str, object]], tuple[str | None, bool]] | None = None

    def failure(self, stats: dict[str, int]) -> str | None:
        return self.failure_message(stats) if self.failure_message else None

    def resolve_status(self, job: Job, cancelled: bool) -> tuple[JobStatus, str | None]:
        """``stopped`` is a training run the user stopped from AI-Toolkit itself."""
        if cancelled or job.stats.get("stopped"):
            return "cancelled", None
        message = self.failure(job.stats)
        return ("failed", message) if message else ("completed", None)


JOB_SPECS: dict[JobType, JobSpec] = {
    "auto_caption": JobSpec(
        thread_prefix="auto-caption",
        run=run_auto_caption_job,
        failure_message=auto_caption_failure_message,
        validate=_validate_auto_caption,
        caption_mode=_auto_caption_mode,
    ),
    "strip_metadata": JobSpec(
        thread_prefix="strip-metadata",
        run=run_strip_metadata_job,
        failure_message=strip_metadata_error_message,
        validate=_folder_only(validate_strip_metadata_folder),
    ),
    "set_captions": JobSpec(
        thread_prefix="set-captions",
        run=run_set_captions_job,
        failure_message=set_captions_error_message,
        validate=_folder_only(validate_set_captions_folder),
    ),
    "replace_captions": JobSpec(
        thread_prefix="replace-captions",
        run=run_replace_captions_job,
        failure_message=replace_captions_error_message,
        validate=_validate_replace_captions,
    ),
    "find_duplicates": JobSpec(
        thread_prefix="find-duplicates",
        run=run_find_duplicates_job,
        failure_message=find_duplicates_error_message,
        validate=_validate_find_duplicates,
    ),
    "batch_rename": JobSpec(
        thread_prefix="rename-media",
        run=run_rename_media_job,
        failure_message=rename_media_error_message,
        validate=_validate_rename_media,
    ),
    "backup_captions": JobSpec(
        thread_prefix="backup-captions",
        run=run_backup_captions_job,
        failure_message=backup_captions_error_message,
        validate=_folder_only(validate_backup_captions_folder),
    ),
    "restore_captions": JobSpec(
        thread_prefix="restore-captions",
        run=run_restore_captions_job,
        failure_message=restore_captions_error_message,
        validate=_folder_only(validate_restore_captions_folder),
    ),
    "verify_captions": JobSpec(
        thread_prefix="verify-captions",
        run=run_verify_captions_job,
        failure_message=verify_captions_failure_message,
        validate=_folder_only(validate_verify_captions_folder),
    ),
    "check_caption_rules": JobSpec(
        thread_prefix="check-caption-rules",
        run=run_check_caption_rules_job,
        failure_message=check_caption_rules_error_message,
        validate=_folder_only(validate_check_caption_rules_folder),
    ),
    "edit_captions": JobSpec(
        thread_prefix="edit-captions",
        run=run_edit_captions_job,
        failure_message=edit_captions_failure_message,
        validate=_validate_edit_captions,
        caption_mode=_edit_captions_mode,
    ),
    "watermark": JobSpec(
        thread_prefix="watermark",
        run=run_watermark_job,
        failure_message=watermark_error_message,
        validate=_validate_watermark,
    ),
    "auto_adjust": JobSpec(
        thread_prefix="auto-adjust",
        run=run_auto_adjust_job,
        failure_message=auto_adjust_error_message,
        validate=_validate_auto_adjust,
    ),
    "resize": JobSpec(
        thread_prefix="resize",
        run=run_resize_job,
        failure_message=resize_error_message,
        validate=_validate_resize,
    ),
    "split_video": JobSpec(
        thread_prefix="split-video",
        run=run_split_video_job,
        failure_message=split_video_error_message,
        validate=_validate_split_video,
    ),
    "comfy_process": JobSpec(
        thread_prefix="comfy-process",
        run=run_comfy_process_job,
        failure_message=comfy_process_error_message,
        validate=_validate_comfy_process,
        workflow=_comfy_workflow,
        # No resume: prompt ids are never persisted and ComfyUI history is bounded.
    ),
    "train_lora": JobSpec(
        thread_prefix="train-lora",
        run=run_train_lora_job,
        validate=validate_train_lora_folder,
        resume=_resume_train_lora,
        external_ref=_train_lora_external_ref,
        workflow=_train_lora_workflow,
    ),
}


@dataclass(frozen=True)
class _QueuedRun:
    """A job waiting for the folder's active job; everything its worker needs to start later."""

    spec: JobSpec
    job_id: str
    folder: Path
    cancel_event: threading.Event
    params: dict[str, object]


def _queue_stop_reason(previous: Job | None) -> str:
    if previous is None:
        return "Not run: the job before it was deleted."
    label = job_outcome.job_type_label(previous.job_type)
    outcome = job_outcome.effective_status(previous.job_type, previous.status, previous.stats)
    verb = {
        "cancelled": "was cancelled",
        "interrupted": "was interrupted",
        "completed": "finished with failed files",
    }.get(outcome, "failed")
    return f"Not run: {label} before it {verb}."


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        #: Per folder (``Job.folder``), the jobs waiting behind its active one, in start order.
        self._queues: dict[str, list[_QueuedRun]] = {}
        self._lock = threading.Lock()
        self._cancel_flags: dict[str, threading.Event] = {}
        self._deleted_ids: set[str] = set()
        self._published: dict[str, tuple[float, str]] = {}

    def initialize(self) -> None:
        resumable = self._resumable_jobs()
        resumed_ids = {job.id for job, _ in resumable}

        for job_id in jobs_store.recover_stale_jobs():
            stored = jobs_store.get_job(job_id)
            # Only the jobs this restart cut off; a job already finished is not announced again.
            if stored is not None and job_id not in resumed_ids:
                self._notify_outcome(stored)

        for job, params in resumable:
            self._resume_job(job, params)

    def get_job(self, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                return job
        return self._job_from_store(job_id)

    def get_job_results(self, job_id: str) -> list[dict[str, object]] | None:
        """Per-file results for one job, or ``None`` when no such job exists."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                return list(job.results)

        stored = jobs_store.get_job(job_id)
        if stored is None:
            return None

        results = stored.get("results")
        return list(results) if isinstance(results, list) else []

    def snapshot_revision(self) -> int:
        """Read before ``list_jobs``: every save stamped below it is already in the store."""
        # Saves stamp and write under this lock, so none can be half-done while we hold it.
        with self._lock:
            return next_revision()

    def list_jobs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        job_types: Sequence[str] | None = None,
        status: JobHistoryStatus | None = None,
        folder: str | None = None,
    ) -> list[Job]:
        stored_jobs = jobs_store.list_jobs(
            limit=limit, offset=offset, job_types=job_types, status=status, folder=folder
        )

        with self._lock:
            memory_jobs = dict(self._jobs)

        jobs: list[Job] = []
        for stored in stored_jobs:
            job_id = str(stored["id"])
            if job_id in memory_jobs:
                jobs.append(memory_jobs[job_id])
            else:
                jobs.append(Job.from_dict(stored))
        return jobs

    def get_latest_job_for_folder(
        self,
        folder: str,
        *,
        job_type: JobType | None = None,
    ) -> Job | None:
        with self._lock:
            # A queued job is newer than the one running ahead of it, but the running one is
            # what the folder is doing; running jobs always live in memory.
            running = self._memory_job_for_folder_unlocked(
                folder, job_type=job_type, statuses=frozenset({"running"})
            )
            if running is not None:
                return running
            memory_match = self._memory_job_for_folder_unlocked(folder, job_type=job_type)

        stored = jobs_store.get_latest_job_for_folder(folder, job_type=job_type)
        if memory_match is not None and stored is not None:
            if memory_match.created_at >= str(stored["created_at"]):
                return memory_match
            return Job.from_dict(stored)

        if memory_match is not None:
            return memory_match
        if stored is not None:
            return Job.from_dict(stored)
        return None

    def active_jobs(self, job_type: JobType) -> list[Job]:
        with self._lock:
            return [
                job
                for job in self._jobs.values()
                if job.job_type == job_type and job.status in ACTIVE_STATUSES
            ]

    def get_active_job_for_folder(
        self,
        folder: str,
        *,
        job_type: JobType | None = None,
    ) -> Job | None:
        with self._lock:
            active = self._memory_job_for_folder_unlocked(
                folder, job_type=job_type, statuses=frozenset({"running"})
            ) or self._memory_job_for_folder_unlocked(
                folder, job_type=job_type, statuses=ACTIVE_STATUSES
            )
            if active is not None:
                return active

        stored = jobs_store.get_active_job_for_folder(folder, job_type=job_type)
        if stored is None:
            return None
        return Job.from_dict(stored)

    def queue_job(self, job_type: JobType, folder: Path, **params: object) -> Job:
        """Start a job of ``job_type``, or queue it behind the folder's active job; ``params`` are
        forwarded to its runner. Validated now, and again when a queued job starts."""
        spec = JOB_SPECS[job_type]
        folder = resolve_path(folder.expanduser())
        spec.validate(folder, **params)

        job, start_now = self._register_job(spec, folder, job_type, params)
        if start_now is not None:
            self._spawn_worker(start_now)
        return job

    def queued_jobs(self, folder: str) -> list[Job]:
        """The jobs waiting behind ``folder``'s active job, in the order they will start."""
        with self._lock:
            runs = self._queues.get(str(normalize_user_path(folder)), [])
            return [self._jobs[run.job_id] for run in runs if run.job_id in self._jobs]

    def cancel_job(self, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
            cancel_event = self._cancel_flags.get(job_id)
            if job is None:
                return self._job_from_store(job_id)

            if cancel_event is None or job.status not in ACTIVE_STATUSES:
                return job
            cancel_event.set()
            # A queued job has no worker to notice the flag; the rest of the queue still runs.
            if self._dequeue_unlocked(job_id):
                job.status = "cancelled"
                job.finished_at = _utc_now()
                self._save_snapshot(job_id, job.to_dict())
        return job

    def undo_job(self, job_id: str) -> dict[str, object] | None:
        """Take back a finished caption job's writes; ``None`` when there is no such job.

        Raises :class:`JobUndoError` while the job runs or while nothing is left to undo, which
        includes while another undo of it is restoring. Failed restores stay for a retry.
        """
        with self._lock:
            job = self._jobs.get(job_id) or self._job_from_store(job_id)
            if job is None:
                return None
            if job.status in ACTIVE_STATUSES:
                raise JobUndoError("The job is still running")
            records = jobs_store.take_job_undo(job_id)
            if records is None:
                raise JobUndoError("Nothing left to undo for this job")
            job.undoable = False
            self._jobs[job_id] = job
            self._save_snapshot(job_id, job.to_dict())
        # Outside the lock: each restore waits on its caption's claim.
        outcome, retry = undo_caption_writes(records)
        if retry:
            with self._lock:
                if job_id not in self._deleted_ids:
                    jobs_store.save_job_undo(job_id, retry)
                    job.undoable = True
                    self._save_snapshot(job_id, job.to_dict())
        return outcome

    def delete_job(self, job_id: str) -> bool:
        stored = jobs_store.get_job(job_id)
        with self._lock:
            memory_job = self._jobs.get(job_id)

        if stored is None and memory_job is None:
            return False

        had_memory = memory_job is not None

        if memory_job is not None and memory_job.status in ACTIVE_STATUSES:
            self.cancel_job(job_id)

        with self._lock:
            self._jobs.pop(job_id, None)
            self._cancel_flags.pop(job_id, None)
            self._published.pop(job_id, None)
            self._deleted_ids.add(job_id)
            deleted_store = jobs_store.delete_job(job_id)
            self._publish_removed([job_id])

        return deleted_store or had_memory

    def prune_finished(self, days: int) -> int:
        with self._lock:
            pruned = jobs_store.prune_finished_jobs(days)
            for job_id in pruned:
                self._jobs.pop(job_id, None)
                self._cancel_flags.pop(job_id, None)
                self._published.pop(job_id, None)
            if pruned:
                self._publish_removed(pruned)
        return len(pruned)

    def delete_all_jobs(self) -> int:
        with self._lock:
            for job_id, job in list(self._jobs.items()):
                if job.status in ACTIVE_STATUSES:
                    cancel_event = self._cancel_flags.get(job_id)
                    if cancel_event is not None:
                        cancel_event.set()

            # Only a live worker can write a row back, and every live worker is in memory.
            for job_id in self._jobs:
                self._deleted_ids.add(job_id)
            memory_ids = list(self._jobs)

            self._jobs.clear()
            self._queues.clear()
            self._cancel_flags.clear()
            self._published.clear()

            # Hold the lock so a worker cannot re-insert a ``running`` row after we clear.
            stored_ids = jobs_store.delete_all_jobs()
            removed = list(dict.fromkeys([*stored_ids, *memory_ids]))
            if removed:
                self._publish_removed(removed)
            return len(stored_ids)

    def _resumable_jobs(self) -> list[tuple[Job, dict[str, object]]]:
        """Jobs left active by a previous process whose spec knows how to pick them back up."""
        stored_jobs: list[dict[str, object]] = []
        with suppress(Exception):
            stored_jobs = jobs_store.list_active_jobs()

        resumable: list[tuple[Job, dict[str, object]]] = []
        for stored in stored_jobs:
            job = Job.from_dict(stored)
            spec = JOB_SPECS.get(job.job_type)
            if spec is None or spec.resume is None:
                continue
            params = spec.resume(job)
            if params is not None:
                resumable.append((job, params))
        return resumable

    def _resume_job(self, job: Job, params: dict[str, object]) -> None:
        """Re-attach to a job whose real work outlived the last process, keeping its row."""
        cancel_event = threading.Event()

        job.status = "queued"
        job.error = None
        job.finished_at = None

        with self._lock:
            self._jobs[job.id] = job
            self._cancel_flags[job.id] = cancel_event

        self._persist(job)
        self._spawn_worker(
            _QueuedRun(JOB_SPECS[job.job_type], job.id, Path(job.folder), cancel_event, params)
        )

    def _spawn_worker(self, run: _QueuedRun, *, revalidate: bool = False) -> None:
        thread = threading.Thread(
            target=lambda: self._run_managed_job(run, revalidate=revalidate),
            name=f"{run.spec.thread_prefix}-{run.job_id[:8]}",
            daemon=True,
        )
        thread.start()

    def _register_job(
        self,
        spec: JobSpec,
        folder: Path,
        job_type: JobType,
        params: dict[str, object],
    ) -> tuple[Job, _QueuedRun | None]:
        """Store the job as queued and return the run to start now, or ``None`` when it waits in
        the folder's queue. Earlier finished runs stay in the store as history; only their
        in-memory copies are dropped."""
        with self._lock:
            # Decided and queued under one lock hold, so the active job cannot finish in between
            # and leave this one waiting in a queue nobody advances.
            busy = self._memory_job_for_folder_unlocked(str(folder), statuses=ACTIVE_STATUSES)

            job_id = uuid.uuid4().hex
            workflow, workflow_edited = spec.workflow(params) if spec.workflow else (None, False)
            job = Job(
                id=job_id,
                folder=str(folder),
                job_type=job_type,
                auto_caption_mode=spec.caption_mode(params) if spec.caption_mode else None,
                external_ref=spec.external_ref(params) if spec.external_ref else None,
                workflow=workflow,
                workflow_edited=workflow_edited,
            )
            self._jobs[job_id] = job
            cancel_event = threading.Event()
            self._cancel_flags[job_id] = cancel_event

            for jid in list(self._jobs):
                if jid == job_id:
                    continue
                existing = self._jobs[jid]
                if (
                    existing.folder == job.folder
                    and existing.job_type == job_type
                    and existing.status not in ACTIVE_STATUSES
                ):
                    self._jobs.pop(jid, None)
                    self._cancel_flags.pop(jid, None)
                    self._published.pop(jid, None)

            run = _QueuedRun(spec, job_id, folder, cancel_event, params)
            if busy is not None:
                self._queues.setdefault(job.folder, []).append(run)
            # Saved before any worker exists: a later save of this queued frame would overwrite
            # the running one the worker stores when it begins.
            self._save_snapshot(job_id, job.to_dict())

        return job, None if busy is not None else run

    def _run_managed_job(self, run: _QueuedRun, *, revalidate: bool = False) -> None:
        try:
            self._execute(run, revalidate=revalidate)
        finally:
            next_run = self._advance_queue(str(run.folder), run.job_id)
            if next_run is not None:
                self._spawn_worker(next_run, revalidate=True)

    def _execute(self, run: _QueuedRun, *, revalidate: bool) -> None:
        job_id, cancel_event = run.job_id, run.cancel_event
        if not self._begin_job(job_id, cancel_event):
            return

        try:
            # The folder may have changed while the job waited, often through the job before it.
            if revalidate:
                run.spec.validate(run.folder, **run.params)
            result = run.spec.run(
                run.folder,
                on_progress=self._progress_callback(job_id),
                should_cancel=cancel_event.is_set,
                **run.params,
            )
        except Exception as exc:
            self._fail_job(job_id, str(exc))
            return

        self._complete_job(job_id, result, cancel_event.is_set(), run.spec)

    def _advance_queue(self, folder: str, finished_id: str) -> _QueuedRun | None:
        """The folder's next run once ``finished_id`` is done, or ``None``. Anything short of a
        clean finish cancels the whole queue: a failed, cancelled, interrupted or deleted job, or
        one that completed with failed files."""
        with self._lock:
            queue = self._queues.get(folder)
            if not queue:
                return None

            finished = None if finished_id in self._deleted_ids else self._jobs.get(finished_id)
            if finished is not None and job_outcome.finished_cleanly(
                finished.job_type, finished.status, finished.stats
            ):
                next_run = queue.pop(0)
                if not queue:
                    del self._queues[folder]
                return next_run

            del self._queues[folder]
            reason = _queue_stop_reason(finished)
            for run in queue:
                skipped = self._jobs.get(run.job_id)
                if skipped is None:
                    continue
                run.cancel_event.set()
                skipped.status = "cancelled"
                skipped.error = reason
                skipped.finished_at = _utc_now()
                # One notification for the whole queue, below, instead of one per job.
                self._save_snapshot(run.job_id, skipped.to_dict(), notify=False)

        self._notify_queue_cancelled(folder, finished_id, len(queue), reason)
        return None

    def _dequeue_unlocked(self, job_id: str) -> bool:
        for folder, queue in self._queues.items():
            for index, run in enumerate(queue):
                if run.job_id == job_id:
                    del queue[index]
                    if not queue:
                        del self._queues[folder]
                    return True
        return False

    def _begin_job(self, job_id: str, cancel_event: threading.Event) -> bool:
        with self._lock:
            job = self._jobs[job_id]
            if cancel_event.is_set():
                job.status = "cancelled"
                job.finished_at = _utc_now()
            else:
                job.status = "running"
                job.started_at = job.started_at or _utc_now()
            snapshot = job.to_dict()
            self._save_snapshot(job_id, snapshot)

        return not cancel_event.is_set()

    def _progress_callback(self, job_id: str) -> ProgressCallback:
        def on_progress(
            current_file: str,
            current_name: str,
            processed: int,
            total: int,
            stats: dict[str, int],
        ) -> None:
            with self._lock:
                active = self._jobs.get(job_id)
                if active is None:
                    return
                active.current_file = current_file
                active.current_name = current_name
                active.processed = processed
                active.total = total
                active.stats = dict(stats)
                self._save_snapshot(job_id, active.to_dict())

        return on_progress

    def _fail_job(self, job_id: str, error: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "failed"
            job.error = error
            job.finished_at = _utc_now()
            self._save_snapshot(job_id, job.to_dict())

    def _complete_job(
        self,
        job_id: str,
        result: dict[str, object],
        cancelled: bool,
        spec: JobSpec,
    ) -> None:
        with self._lock:
            if job_id in self._deleted_ids:
                return
            job = self._jobs.get(job_id)
            if job is None:
                return

            job.total = _stored_int(result, "total")
            job.processed = _stored_int(result, "processed")
            stats = result.get("stats")
            job.stats = dict(stats) if isinstance(stats, dict) else {}
            results = result.get("results")
            job.results = list(results) if isinstance(results, list) else []
            undos = result.get("caption_undo")
            if isinstance(undos, list) and undos:
                jobs_store.save_job_undo(job_id, undo_records(undos))
                job.undoable = True
            job.current_file = None
            job.current_name = None
            job.finished_at = _utc_now()

            status, error = spec.resolve_status(job, cancelled)
            job.status = status
            job.error = error
            self._save_snapshot(job_id, job.to_dict())

    def _memory_job_for_folder_unlocked(
        self,
        folder: str,
        *,
        job_type: JobType | None = None,
        statuses: frozenset[str] | None = None,
    ) -> Job | None:
        """The newest in-memory job for ``folder``, limited to ``statuses`` when given."""
        normalized = str(normalize_user_path(folder))
        for job in reversed(list(self._jobs.values())):
            if job.folder != normalized:
                continue
            if job_type is not None and job.job_type != job_type:
                continue
            if statuses is not None and job.status not in statuses:
                continue
            return job
        return None

    def _job_from_store(self, job_id: str) -> Job | None:
        stored = jobs_store.get_job(job_id)
        if stored is None:
            return None
        return Job.from_dict(stored)

    def _persist(self, job: Job) -> None:
        with self._lock:
            self._save_snapshot(job.id, job.to_dict())

    def _save_snapshot(
        self, job_id: str, snapshot: dict[str, object], *, notify: bool = True
    ) -> None:
        """Stamp, write and push a snapshot. Caller must hold ``self._lock``.

        Mid-run progress is thinned for the store and the stream alike; a thinned frame still
        lives in memory, which ``list_jobs`` reads first.
        """
        job = self._jobs.get(job_id)
        if job_id in self._deleted_ids or job is None:
            return

        job.revision = next_revision()
        snapshot["revision"] = job.revision
        if self._is_thinned(job_id, snapshot):
            return

        jobs_store.save_job(snapshot)
        self._publish_snapshot(job_id, snapshot, notify=notify)

    def _is_thinned(self, job_id: str, snapshot: dict[str, object]) -> bool:
        """A status change always goes out; a same-status frame only after the minimum interval."""
        published = self._published.get(job_id)
        return (
            published is not None
            and published[1] == str(snapshot.get("status") or "")
            and monotonic() - published[0] < JOB_EVENT_MIN_INTERVAL_SECONDS
        )

    def _publish_snapshot(
        self, job_id: str, snapshot: dict[str, object], *, notify: bool = True
    ) -> None:
        status = str(snapshot.get("status") or "")
        published = self._published.get(job_id)
        previous_status = published[1] if published is not None else ""

        self._published[job_id] = (monotonic(), status)
        events.publish(JobEvent(job=job_outcome.job_response(snapshot)).model_dump())

        if notify and previous_status and previous_status != status:
            self._notify_outcome(snapshot)

    def _publish_removed(self, job_ids: list[str]) -> None:
        """Caller must hold ``self._lock``, so the revision orders against concurrent saves."""
        events.publish(JobsRemovedEvent(ids=job_ids, revision=next_revision()).model_dump())

    def _notify_queue_cancelled(
        self, folder: str, finished_id: str, count: int, reason: str
    ) -> None:
        jobs = "1 queued job" if count == 1 else f"{count} queued jobs"
        detail = reason.removeprefix("Not run: ").rstrip(".")
        message = f'{jobs} in "{path_leaf_name(folder)}" cancelled: {detail}.'
        with suppress(Exception):
            notifications.record_notification(message, "warning", source="job", job_id=finished_id)

    def _notify_outcome(self, snapshot: dict[str, object]) -> None:
        outcome = job_outcome.completion_notification(snapshot)
        if outcome is None:
            return

        variant, message = outcome
        # A job that already finished must not fail because its notification could not be stored.
        with suppress(Exception):
            notifications.record_notification(
                message, variant, source="job", job_id=str(snapshot.get("id") or "")
            )


job_manager = JobManager()
