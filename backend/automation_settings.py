"""Job settings per folder with a most-recent fallback; ComfyUI jobs remember per preset."""

from __future__ import annotations

from pydantic import BaseModel, Field

from automation.comfy_run import comfy_run_generates
from filesystem import preference_folder_key
from preferences import FolderScopedPreference, JsonPreference, validated_or_default
from schemas import (
    AutoCaptionJobSettings,
    AutomationSettingsResponse,
    BackupCaptionsJobSettings,
    BatchRenameJobSettings,
    ComfyGenerateOutputSettings,
    ComfyPresetSettings,
    ComfyRunJobSettings,
    ComfyRunSettingsResponse,
    ComfyShowcaseJobSettings,
    EditCaptionsJobSettings,
    FindDuplicatesJobSettings,
    ReplaceCaptionsJobSettings,
    ResizeJobSettings,
    SetCaptionsJobSettings,
    SplitVideoJobSettings,
    TrainLoraJobSettings,
    TrimVideoJobSettings,
    VerifyCaptionsJobSettings,
    WatermarkJobSettings,
)

AUTOMATION_SETTINGS_KEY_PREFIX = "automation_settings"
COMFY_RUN_JOB_TYPE = "comfy_run"

#: Keys are job types; jobs with no dialog are absent.
JOB_SETTINGS_MODELS: dict[str, type[BaseModel]] = {
    "auto_caption": AutoCaptionJobSettings,
    "set_captions": SetCaptionsJobSettings,
    "replace_captions": ReplaceCaptionsJobSettings,
    "backup_captions": BackupCaptionsJobSettings,
    "verify_captions": VerifyCaptionsJobSettings,
    "edit_captions": EditCaptionsJobSettings,
    "batch_rename": BatchRenameJobSettings,
    "find_duplicates": FindDuplicatesJobSettings,
    "train_lora": TrainLoraJobSettings,
    "watermark": WatermarkJobSettings,
    "resize": ResizeJobSettings,
    "split_video": SplitVideoJobSettings,
    "trim_video": TrimVideoJobSettings,
    # Seeds and all: a showcase is run again to compare, so it must repeat.
    "comfy_showcase": ComfyShowcaseJobSettings,
}

__all__ = [
    "AUTOMATION_SETTINGS_KEY_PREFIX",
    "COMFY_RUN_JOB_TYPE",
    "JOB_SETTINGS_MODELS",
    "automation_settings_key",
    "forget_folder_settings",
    "get_automation_settings",
    "preference_folder_key",
    "remember_job_settings",
    "remembered_folder_count",
]


def automation_settings_key(job_type: str) -> str:
    return f"{AUTOMATION_SETTINGS_KEY_PREFIX}.{job_type}"


_STORES: dict[str, FolderScopedPreference] = {
    job_type: FolderScopedPreference(automation_settings_key(job_type), model)
    for job_type, model in JOB_SETTINGS_MODELS.items()
}


class _ComfyFolderSettings(ComfyGenerateOutputSettings):
    overwrite_candidates: bool = False


# Per-folder settings under the job's key; per-preset under ``.presets``.
_COMFY_FOLDER_STORE: FolderScopedPreference[_ComfyFolderSettings] = FolderScopedPreference(
    automation_settings_key(COMFY_RUN_JOB_TYPE), _ComfyFolderSettings
)


class _ComfyPresetEnvelope(BaseModel):
    """Untyped so one corrupt preset cannot fail the rest."""

    preset: str = ""
    by_preset: dict[str, dict[str, object]] = Field(default_factory=dict)


_COMFY_STORE: JsonPreference[_ComfyPresetEnvelope] = JsonPreference(
    f"{automation_settings_key(COMFY_RUN_JOB_TYPE)}.presets", _ComfyPresetEnvelope
)


def _get_comfy_run_settings(folder_key: str) -> ComfyRunSettingsResponse:
    envelope = _COMFY_STORE.get()
    return ComfyRunSettingsResponse(
        preset=envelope.preset,
        by_preset={
            name: validated_or_default(ComfyPresetSettings, payload)
            for name, payload in envelope.by_preset.items()
        },
        **_COMFY_FOLDER_STORE.get(folder_key).model_dump(),
    )


def _remember_comfy_run_settings(body: BaseModel, folder_key: str) -> None:
    # A file's own workflow is a one-off, not a preset.
    if getattr(body, "source", None) is not None:
        return
    run = ComfyRunJobSettings.model_validate(
        body.model_dump(include=set(ComfyRunJobSettings.model_fields))
    )
    _COMFY_FOLDER_STORE.save(
        folder_key,
        _ComfyFolderSettings.model_validate(
            run.model_dump(include=set(_ComfyFolderSettings.model_fields))
        ),
    )
    # A generation's seed never, or the next open repeats the last images.
    seed = None if comfy_run_generates(run.preset, None) else run.seed
    payload = run.model_dump(mode="json", include=set(ComfyPresetSettings.model_fields))
    envelope = _COMFY_STORE.get()
    _COMFY_STORE.save(
        _ComfyPresetEnvelope(
            preset=run.preset,
            by_preset={**envelope.by_preset, run.preset: {**payload, "seed": seed}},
        )
    )


def get_automation_settings(*, folder_path: str) -> AutomationSettingsResponse:
    folder_key = preference_folder_key(folder_path)
    return AutomationSettingsResponse(
        folder_path=folder_key,
        comfy_run=_get_comfy_run_settings(folder_key),
        **{job_type: store.get(folder_key) for job_type, store in _STORES.items()},
    )


def remember_job_settings(job_type: str, body: BaseModel, *, folder_path: str) -> None:
    """Job types with no registered model are skipped."""
    if job_type == COMFY_RUN_JOB_TYPE:
        _remember_comfy_run_settings(body, preference_folder_key(folder_path))
        return

    model = JOB_SETTINGS_MODELS.get(job_type)
    if model is None:
        return

    settings = model.model_validate(body.model_dump(include=set(model.model_fields)))
    _STORES[job_type].save(preference_folder_key(folder_path), settings)


def _folder_stores() -> list[FolderScopedPreference]:
    return [*_STORES.values(), _COMFY_FOLDER_STORE]


def remembered_folder_count() -> int:
    return len(set().union(*(store.folder_keys() for store in _folder_stores())))


def forget_folder_settings() -> None:
    for store in _folder_stores():
        store.forget_folders()
