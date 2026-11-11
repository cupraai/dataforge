"""Job severity and outcome prose, derived from the stats the workers recorded."""

from __future__ import annotations

from collections.abc import Callable

from constants import CAPTION_SIDECAR_EXTENSIONS, JOB_TYPE_LABELS
from filesystem import path_leaf_name
from schemas import JobResponse, NotificationVariant

TERMINAL_STATUSES: frozenset[str] = frozenset({"completed", "failed", "cancelled", "interrupted"})

#: Types whose only completed outcome is success; nothing they count reads as a warning.
_NEVER_WARN: frozenset[str] = frozenset(
    {
        "strip_metadata",
        "set_captions",
        "batch_rename",
        "backup_captions",
        "train_lora",
        "watermark",
        "auto_adjust",
        "resize",
    }
)

_CAPTION_SIDECAR_LIST = "/".join(CAPTION_SIDECAR_EXTENSIONS)


def job_type_label(job_type: str) -> str:
    return JOB_TYPE_LABELS.get(job_type) or job_type.strip() or "Job"


def _count(stats: dict[str, int], *keys: str) -> int:
    return sum(int(stats.get(key) or 0) for key in keys)


#: The stat keys that demote a completed job of this type to a failure.
_FAILURE_KEYS: dict[str, tuple[str, ...]] = {
    "verify_captions": ("api_error", "parse_error", "read_error", "frame_error"),
    "auto_caption": ("api_error", "read_error", "frame_error"),
}


def effective_status(job_type: str, status: str, stats: dict[str, int]) -> str:
    """The status once stats are taken into account: errors demote a completed job to failed."""
    if status != "completed":
        return status

    keys = _FAILURE_KEYS.get(job_type, ("api_error",))
    return "failed" if _count(stats, *keys) else "completed"


def _no_caption_warning(count: int) -> str | None:
    if count == 0:
        return None
    if count == 1:
        return f"1 file had no caption sidecar ({_CAPTION_SIDECAR_LIST}) and was skipped."
    return f"{count} files had no caption sidecar ({_CAPTION_SIDECAR_LIST}) and were skipped."


def _rejected_warning(count: int) -> str | None:
    if count == 0:
        return None
    if count == 1:
        return "1 caption came back in a form the job would not write, and was left unchanged."
    return f"{count} captions came back in a form the job would not write, and were left unchanged."


def _no_audio_warning(count: int) -> str | None:
    if count == 0:
        return None
    if count == 1:
        return "1 video had no audio track and was captioned without it."
    return f"{count} videos had no audio track and were captioned without them."


def _no_clips_warning(count: int) -> str | None:
    if count == 0:
        return None
    if count == 1:
        return "1 video had no piece as long as the shortest clip, so it gave no clips."
    return f"{count} videos had no piece as long as the shortest clip, so they gave no clips."


def _orphaned_backup_warning(count: int) -> str | None:
    if count == 0:
        return None
    if count == 1:
        return "1 backed up caption had no matching media file and was skipped."
    return f"{count} backed up captions had no matching media file and were skipped."


type WarningRule = tuple[str, Callable[[int], str | None]]
_NO_CAPTION: WarningRule = ("no_caption", _no_caption_warning)
_WARNING_RULES: dict[str, tuple[WarningRule, ...]] = {
    "auto_caption": (_NO_CAPTION, ("audio_error", _no_audio_warning)),
    "edit_captions": (_NO_CAPTION, ("rejected", _rejected_warning)),
    "restore_captions": (("orphaned", _orphaned_backup_warning),),
    "split_video": (("skipped", _no_clips_warning),),
}


#: Per-file outcomes the jobs drawer counts as failed files, as ``failedCountFromStats`` does.
_FAILED_FILE_KEYS = frozenset({"busy", "too_short"})


def finished_cleanly(job_type: str, status: str, stats: dict[str, int]) -> bool:
    """Completed with no failed file: what lets the next job queued for the folder start."""
    if effective_status(job_type, status, stats) != "completed":
        return False
    warnings = {key for key, _ in _WARNING_RULES.get(job_type, ())}
    return not any(
        count
        for key, count in stats.items()
        if (key.endswith("_error") or key in _FAILED_FILE_KEYS) and key not in warnings
    )


def warning_message(job_type: str, status: str, stats: dict[str, int]) -> str | None:
    """The job's warning prose, or ``None`` when it finished cleanly."""
    if job_type in _NEVER_WARN or effective_status(job_type, status, stats) != "completed":
        return None

    rules = _WARNING_RULES.get(job_type, (_NO_CAPTION,))
    parts = (message(_count(stats, key)) for key, message in rules)
    return " ".join(part for part in parts if part) or None


def completion_notification(snapshot: dict[str, object]) -> tuple[NotificationVariant, str] | None:
    """The toast a finished job earns, or ``None`` while it is still running."""
    status = str(snapshot.get("status") or "")
    if status not in TERMINAL_STATUSES:
        return None

    job_type = str(snapshot.get("job_type") or "")
    raw_stats = snapshot.get("stats")
    stats = dict(raw_stats) if isinstance(raw_stats, dict) else {}
    folder = str(snapshot.get("folder_name") or "") or path_leaf_name(
        str(snapshot.get("folder") or "")
    )
    label = job_type_label(job_type)
    outcome = effective_status(job_type, status, stats)

    if outcome in ("failed", "interrupted"):
        detail = snapshot.get("error")
        if isinstance(detail, str) and detail:
            return "danger", f'{label} failed in "{folder}": {detail}'
        return "danger", f'{label} failed in "{folder}".'

    if outcome == "cancelled":
        return "warning", f'{label} cancelled in "{folder}".'

    if detail := warning_message(job_type, status, stats):
        return "warning", f'{label} finished with warnings in "{folder}": {detail}'

    return "success", f'{label} completed in "{folder}".'


def job_response(snapshot: dict[str, object]) -> JobResponse:
    """The only place the derived outcome fields are filled in, so they cannot drift."""
    job_type = str(snapshot["job_type"])
    status = str(snapshot.get("status") or "")
    raw_stats = snapshot.get("stats")
    stats = dict(raw_stats) if isinstance(raw_stats, dict) else {}

    return JobResponse.model_validate(
        {
            **snapshot,
            "effective_status": effective_status(job_type, status, stats),
            "warning": warning_message(job_type, status, stats),
        }
    )
