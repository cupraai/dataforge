"""Job settings per folder with a most-recent fallback; ComfyUI jobs remember per preset."""

from __future__ import annotations

from pydantic import BaseModel, Field

from filesystem import preference_folder_key
from preferences import FolderScopedPreference, JsonPreference, validated_or_default
from schemas import (
    AutoCaptionJobSettings,
    AutomationSettingsResponse,
    BackupCaptionsJobSettings,
    BatchRenameJobSettings,
    ComfyGenerateJobSettings,
    ComfyGenerateOutputSettings,
    ComfyGenerateSettingsResponse,
    ComfyPresetSettings,
    ComfyProcessJobSettings,
    ComfyProcessSettingsResponse,
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
COMFY_PROCESS_JOB_TYPE = "comfy_process"
COMFY_GENERATE_JOB_TYPE = "comfy_generate"

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
}

__all__ = [
    "AUTOMATION_SETTINGS_KEY_PREFIX",
    "COMFY_GENERATE_JOB_TYPE",
    "COMFY_PROCESS_JOB_TYPE",
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


class _ComfyFolderSettings(BaseModel):
    overwrite_candidates: bool = False


# Per-folder settings under the job's key; per-preset under ``.presets``.
_COMFY_FOLDER_STORE: FolderScopedPreference[_ComfyFolderSettings] = FolderScopedPreference(
    automation_settings_key(COMFY_PROCESS_JOB_TYPE), _ComfyFolderSettings
)


_COMFY_GENERATE_FOLDER_STORE: FolderScopedPreference[ComfyGenerateOutputSettings] = (
    FolderScopedPreference(
        automation_settings_key(COMFY_GENERATE_JOB_TYPE), ComfyGenerateOutputSettings
    )
)


class _ComfyPresetEnvelope(BaseModel):
    """Untyped so one corrupt preset cannot fail the rest."""

    preset: str = ""
    by_preset: dict[str, dict[str, object]] = Field(default_factory=dict)


def _preset_store(job_type: str) -> JsonPreference[_ComfyPresetEnvelope]:
    return JsonPreference(f"{automation_settings_key(job_type)}.presets", _ComfyPresetEnvelope)


_COMFY_STORE = _preset_store(COMFY_PROCESS_JOB_TYPE)
_COMFY_GENERATE_STORE = _preset_store(COMFY_GENERATE_JOB_TYPE)


def _remembered_presets(
    store: JsonPreference[_ComfyPresetEnvelope],
) -> tuple[str, dict[str, ComfyPresetSettings]]:
    envelope = store.get()
    return envelope.preset, {
        name: validated_or_default(ComfyPresetSettings, payload)
        for name, payload in envelope.by_preset.items()
    }


def _remember_preset(
    store: JsonPreference[_ComfyPresetEnvelope], preset: str, run: BaseModel
) -> None:
    payload = run.model_dump(mode="json", include=set(ComfyPresetSettings.model_fields))
    envelope = store.get()
    store.save(
        _ComfyPresetEnvelope(preset=preset, by_preset={**envelope.by_preset, preset: payload})
    )


def _get_comfy_process_settings(folder_key: str) -> ComfyProcessSettingsResponse:
    preset, by_preset = _remembered_presets(_COMFY_STORE)
    return ComfyProcessSettingsResponse(
        preset=preset,
        overwrite_candidates=_COMFY_FOLDER_STORE.get(folder_key).overwrite_candidates,
        by_preset=by_preset,
    )


def _remember_comfy_process_settings(body: BaseModel, folder_key: str) -> None:
    run = ComfyProcessJobSettings.model_validate(
        body.model_dump(include=set(ComfyProcessJobSettings.model_fields))
    )
    _COMFY_FOLDER_STORE.save(
        folder_key, _ComfyFolderSettings(overwrite_candidates=run.overwrite_candidates)
    )
    _remember_preset(_COMFY_STORE, run.preset, run)


def _get_comfy_generate_settings(folder_key: str) -> ComfyGenerateSettingsResponse:
    preset, by_preset = _remembered_presets(_COMFY_GENERATE_STORE)
    return ComfyGenerateSettingsResponse(
        preset=preset,
        by_preset=by_preset,
        **_COMFY_GENERATE_FOLDER_STORE.get(folder_key).model_dump(),
    )


def _remember_comfy_generate_settings(body: BaseModel, folder_key: str) -> None:
    # A file's own workflow is a one-off, not a preset.
    if getattr(body, "source", None) is not None:
        return
    run = ComfyGenerateJobSettings.model_validate(
        body.model_dump(include=set(ComfyGenerateJobSettings.model_fields))
    )
    _COMFY_GENERATE_FOLDER_STORE.save(
        folder_key,
        ComfyGenerateOutputSettings.model_validate(
            run.model_dump(include=set(ComfyGenerateOutputSettings.model_fields))
        ),
    )
    # Never the seed, or the next open repeats the last images.
    _remember_preset(_COMFY_GENERATE_STORE, run.preset, run.model_copy(update={"seed": None}))


def get_automation_settings(*, folder_path: str) -> AutomationSettingsResponse:
    folder_key = preference_folder_key(folder_path)
    return AutomationSettingsResponse(
        folder_path=folder_key,
        comfy_process=_get_comfy_process_settings(folder_key),
        comfy_generate=_get_comfy_generate_settings(folder_key),
        **{job_type: store.get(folder_key) for job_type, store in _STORES.items()},
    )


def remember_job_settings(job_type: str, body: BaseModel, *, folder_path: str) -> None:
    """Job types with no registered model are skipped."""
    if job_type == COMFY_PROCESS_JOB_TYPE:
        _remember_comfy_process_settings(body, preference_folder_key(folder_path))
        return
    if job_type == COMFY_GENERATE_JOB_TYPE:
        _remember_comfy_generate_settings(body, preference_folder_key(folder_path))
        return

    model = JOB_SETTINGS_MODELS.get(job_type)
    if model is None:
        return

    settings = model.model_validate(body.model_dump(include=set(model.model_fields)))
    _STORES[job_type].save(preference_folder_key(folder_path), settings)


def _folder_stores() -> list[FolderScopedPreference]:
    return [*_STORES.values(), _COMFY_FOLDER_STORE, _COMFY_GENERATE_FOLDER_STORE]


def remembered_folder_count() -> int:
    return len(set().union(*(store.folder_keys() for store in _folder_stores())))


def forget_folder_settings() -> None:
    for store in _folder_stores():
        store.forget_folders()
