import asyncio
from copy import deepcopy
from dataclasses import asdict
from datetime import UTC, datetime

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

import showcase_sets
from automation.auto_caption import preview_auto_caption
from automation.backup_captions import preview_restore_captions
from automation.comfy_generate import load_generation
from automation.edit_captions import preview_caption_edits
from automation.jobs import JobType, job_manager
from automation.replace_captions import preview_caption_replacements
from automation.selection import resolve_selected_media
from automation.watermark import (
    read_watermark_image_info,
    save_watermark_image,
    watermark_image_path,
)
from automation_settings import remember_job_settings
from comfy_loras import list_comfy_loras
from comfy_prompts import extract_graph_branch
from comfy_settings import get_comfy_base_url
from external.comfy_client import probe_available, read_log_lines
from external.comfy_workflows import (
    ComfyWorkflow,
    ComfyWorkflowError,
    list_comfy_presets,
    parse_comfy_workflow,
    read_comfy_preset_text,
    resolve_custom_inputs,
    with_custom_inputs,
)
from external.ostris_training import (
    OstrisTrainingError,
    parse_training_template,
    read_training_template_text,
)
from routes._helpers import job_response, resolve_folder
from schemas import (
    AutoAdjustStartRequest,
    AutoCaptionPreviewRequest,
    AutoCaptionPreviewResponse,
    AutoCaptionStartRequest,
    BackupCaptionsStartRequest,
    BatchRenameStartRequest,
    CheckCaptionRulesStartRequest,
    ComfyLogsResponse,
    ComfyLorasResponse,
    ComfyOutputBranch,
    ComfyPresetInput,
    ComfyPresetMapResponse,
    ComfyPresetsResponse,
    ComfyPresetSummary,
    ComfyPresetTextResponse,
    ComfyRunStartRequest,
    ComfyShowcaseSet,
    ComfyShowcaseSetsResponse,
    ComfyShowcaseStartRequest,
    ComfyWorkflowMapRequest,
    EditCaptionsPreviewRequest,
    EditCaptionsPreviewResponse,
    EditCaptionsStartRequest,
    FindDuplicatesStartRequest,
    JobResponse,
    JobSelectionRequest,
    ReplaceCaptionsPreviewRequest,
    ReplaceCaptionsPreviewResponse,
    ReplaceCaptionsStartRequest,
    ResizeStartRequest,
    RestoreCaptionsPreviewRequest,
    RestoreCaptionsPreviewResponse,
    RestoreCaptionsStartRequest,
    SetCaptionsStartRequest,
    SplitVideoStartRequest,
    StripMetadataStartRequest,
    TrainingModel,
    TrainingTemplateCheckRequest,
    TrainingTemplateCheckResponse,
    TrainingTemplateResponse,
    TrainLoraStartRequest,
    TrimVideoStartRequest,
    VerifyCaptionsStartRequest,
    WatermarkImageInfo,
    WatermarkStartRequest,
)

router = APIRouter()

FOLDER_QUERY = Query(..., description="Absolute path to the folder the job runs on")


def _start_job(job_type: JobType, path: str, body: JobSelectionRequest) -> JobResponse:
    """And remember what it ran with."""
    folder = resolve_folder(path)
    try:
        selected_paths = resolve_selected_media(folder, body.paths)
        job = job_manager.queue_job(
            job_type,
            folder,
            selected_paths=selected_paths,
            **body.model_dump(exclude={"paths"}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Only a job that actually queued is remembered.
    remember_job_settings(job_type, body, folder_path=str(folder))
    return job_response(job)


@router.post("/automation/auto-caption", response_model=JobResponse)
def start_auto_caption(
    path: str = FOLDER_QUERY, body: AutoCaptionStartRequest = AutoCaptionStartRequest()
) -> JobResponse:
    return _start_job("auto_caption", path, body)


@router.post("/automation/auto-caption/preview", response_model=AutoCaptionPreviewResponse)
def preview_auto_caption_job(
    path: str = FOLDER_QUERY,
    body: AutoCaptionPreviewRequest = AutoCaptionPreviewRequest(),
) -> AutoCaptionPreviewResponse:
    """POST, so a large selection fits in the body."""
    folder = resolve_folder(path)
    try:
        selected_paths = resolve_selected_media(folder, body.paths)
        preview = preview_auto_caption(folder, selected_paths=selected_paths)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return AutoCaptionPreviewResponse.model_validate(preview)


@router.post("/automation/set-captions", response_model=JobResponse)
def start_set_captions_job(
    path: str = FOLDER_QUERY, body: SetCaptionsStartRequest = SetCaptionsStartRequest()
) -> JobResponse:
    return _start_job("set_captions", path, body)


@router.post("/automation/replace-captions", response_model=JobResponse)
def start_replace_captions_job(
    path: str = FOLDER_QUERY, body: ReplaceCaptionsStartRequest = ReplaceCaptionsStartRequest()
) -> JobResponse:
    return _start_job("replace_captions", path, body)


@router.post("/automation/replace-captions/preview", response_model=ReplaceCaptionsPreviewResponse)
def preview_replace_captions_job(
    path: str = FOLDER_QUERY,
    body: ReplaceCaptionsPreviewRequest = ReplaceCaptionsPreviewRequest(),
) -> ReplaceCaptionsPreviewResponse:
    """POST because a regex can be long."""
    folder = resolve_folder(path)

    try:
        selected_paths = resolve_selected_media(folder, body.paths)
        preview = preview_caption_replacements(
            folder,
            mode=body.mode,
            search=body.search,
            replacement=body.replacement,
            use_regex=body.use_regex,
            case_sensitive=body.case_sensitive,
            selected_paths=selected_paths,
        )
    except ValueError as exc:
        # An unusable edit is normal while typing, so it is a body field.
        return ReplaceCaptionsPreviewResponse(folder=str(folder), error=str(exc))

    return ReplaceCaptionsPreviewResponse.model_validate(preview)


@router.post("/automation/find-duplicates", response_model=JobResponse)
def start_find_duplicates_job(
    path: str = FOLDER_QUERY, body: FindDuplicatesStartRequest = FindDuplicatesStartRequest()
) -> JobResponse:
    return _start_job("find_duplicates", path, body)


@router.post("/automation/check-caption-rules", response_model=JobResponse)
def start_check_caption_rules_job(
    path: str = FOLDER_QUERY, body: CheckCaptionRulesStartRequest = CheckCaptionRulesStartRequest()
) -> JobResponse:
    return _start_job("check_caption_rules", path, body)


@router.post("/automation/strip-metadata", response_model=JobResponse)
def start_strip_metadata_job(
    path: str = FOLDER_QUERY, body: StripMetadataStartRequest = StripMetadataStartRequest()
) -> JobResponse:
    return _start_job("strip_metadata", path, body)


@router.post("/automation/batch-rename", response_model=JobResponse)
def start_batch_rename_job(
    path: str = FOLDER_QUERY, body: BatchRenameStartRequest = BatchRenameStartRequest()
) -> JobResponse:
    return _start_job("batch_rename", path, body)


@router.post("/automation/backup-captions", response_model=JobResponse)
def start_backup_captions_job(
    path: str = FOLDER_QUERY, body: BackupCaptionsStartRequest = BackupCaptionsStartRequest()
) -> JobResponse:
    return _start_job("backup_captions", path, body)


@router.post("/automation/auto-adjust", response_model=JobResponse)
def start_auto_adjust_job(
    path: str = FOLDER_QUERY, body: AutoAdjustStartRequest = AutoAdjustStartRequest()
) -> JobResponse:
    return _start_job("auto_adjust", path, body)


@router.post("/automation/resize", response_model=JobResponse)
def start_resize_job(
    path: str = FOLDER_QUERY, body: ResizeStartRequest = ResizeStartRequest()
) -> JobResponse:
    return _start_job("resize", path, body)


@router.post("/automation/split-video", response_model=JobResponse)
def start_split_video_job(
    path: str = FOLDER_QUERY, body: SplitVideoStartRequest = SplitVideoStartRequest()
) -> JobResponse:
    return _start_job("split_video", path, body)


@router.post("/automation/trim-video", response_model=JobResponse)
def start_trim_video_job(
    path: str = FOLDER_QUERY, body: TrimVideoStartRequest = TrimVideoStartRequest()
) -> JobResponse:
    return _start_job("trim_video", path, body)


@router.post("/automation/restore-captions", response_model=JobResponse)
def start_restore_captions_job(
    path: str = FOLDER_QUERY, body: RestoreCaptionsStartRequest = RestoreCaptionsStartRequest()
) -> JobResponse:
    return _start_job("restore_captions", path, body)


@router.post("/automation/restore-captions/preview", response_model=RestoreCaptionsPreviewResponse)
def preview_restore_captions_job(
    path: str = FOLDER_QUERY,
    body: RestoreCaptionsPreviewRequest = RestoreCaptionsPreviewRequest(),
) -> RestoreCaptionsPreviewResponse:
    """POST, so a large selection fits in the body."""
    folder = resolve_folder(path)
    try:
        selected_paths = resolve_selected_media(folder, body.paths)
        preview = preview_restore_captions(folder, selected_paths=selected_paths)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RestoreCaptionsPreviewResponse.model_validate(preview)


@router.post("/automation/verify-captions", response_model=JobResponse)
def start_verify_captions_job(
    path: str = FOLDER_QUERY, body: VerifyCaptionsStartRequest = VerifyCaptionsStartRequest()
) -> JobResponse:
    return _start_job("verify_captions", path, body)


@router.post("/automation/edit-captions", response_model=JobResponse)
def start_edit_captions_job(
    path: str = FOLDER_QUERY, body: EditCaptionsStartRequest = EditCaptionsStartRequest()
) -> JobResponse:
    return _start_job("edit_captions", path, body)


@router.post("/automation/edit-captions/preview", response_model=EditCaptionsPreviewResponse)
def preview_edit_captions(
    path: str = FOLDER_QUERY,
    body: EditCaptionsPreviewRequest = EditCaptionsPreviewRequest(),
) -> EditCaptionsPreviewResponse:
    folder = resolve_folder(path)
    try:
        selected_paths = resolve_selected_media(folder, body.paths)
        return preview_caption_edits(
            folder,
            selected_paths=selected_paths,
            **body.model_dump(exclude={"paths"}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/automation/watermark", response_model=JobResponse)
def start_watermark_job(
    path: str = FOLDER_QUERY, body: WatermarkStartRequest = WatermarkStartRequest()
) -> JobResponse:
    return _start_job("watermark", path, body)


@router.get("/automation/watermark/image/info", response_model=WatermarkImageInfo)
def get_watermark_image_info() -> WatermarkImageInfo:
    return read_watermark_image_info()


@router.get(
    "/automation/watermark/image",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No PNG is stored"}},
)
def get_watermark_image() -> Response:
    try:
        content = watermark_image_path().read_bytes()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No PNG watermark is stored") from exc
    # Bytes, so an upload never replaces an open file.
    return Response(content=content, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.put("/automation/watermark/image", response_model=WatermarkImageInfo)
async def put_watermark_image(
    file: UploadFile = File(..., description="The PNG to use as the watermark"),
) -> WatermarkImageInfo:
    try:
        return await asyncio.to_thread(save_watermark_image, file.file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to save the PNG watermark: {exc}"
        ) from exc


@router.post("/automation/comfy-run", response_model=JobResponse)
def start_comfy_run_job(
    path: str = FOLDER_QUERY, body: ComfyRunStartRequest = ComfyRunStartRequest()
) -> JobResponse:
    return _start_job("comfy_run", path, body)


@router.post("/automation/comfy-showcase", response_model=JobResponse)
def start_comfy_showcase_job(
    path: str = FOLDER_QUERY, body: ComfyShowcaseStartRequest = ComfyShowcaseStartRequest()
) -> JobResponse:
    return _start_job("comfy_showcase", path, body)


@router.get("/automation/comfy-showcase/loras", response_model=ComfyLorasResponse)
def list_comfy_showcase_loras() -> ComfyLorasResponse:
    """Always a 200: a stopped ComfyUI is just unavailable."""
    return list_comfy_loras()


@router.get("/automation/comfy-showcase/sets", response_model=ComfyShowcaseSetsResponse)
def list_comfy_showcase_sets() -> ComfyShowcaseSetsResponse:
    return showcase_sets.list_showcase_sets()


@router.put("/automation/comfy-showcase/sets", response_model=ComfyShowcaseSetsResponse)
def save_comfy_showcase_set(body: ComfyShowcaseSet) -> ComfyShowcaseSetsResponse:
    try:
        return showcase_sets.save_showcase_set(body)
    except showcase_sets.TooManyShowcaseSetsError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/automation/comfy-showcase/sets", response_model=ComfyShowcaseSetsResponse)
def delete_comfy_showcase_set(
    name: str = Query(..., description="The set's name, matched ignoring case"),
) -> ComfyShowcaseSetsResponse:
    return showcase_sets.delete_showcase_set(name)


@router.get("/automation/comfy-process/presets", response_model=ComfyPresetsResponse)
def list_comfy_process_presets() -> ComfyPresetsResponse:
    """And whether ComfyUI is answering."""
    return ComfyPresetsResponse(
        presets=[
            ComfyPresetSummary(
                name=preset.name,
                modified_at=datetime.fromtimestamp(preset.modified_at, tz=UTC).isoformat(),
                accepts_prompt=preset.accepts_prompt,
                accepts_seed=preset.accepts_seed,
                inputs=[
                    ComfyPresetInput(name=entry.name, kind=entry.kind, default=entry.default)
                    for entry in preset.custom_inputs
                ],
                generates=preset.generates,
                accepts_loras=preset.accepts_loras,
                source_kind=preset.source_kind,
                accepts_showcase_seed=preset.accepts_showcase_seed,
            )
            for preset in list_comfy_presets()
        ],
        available=probe_available(),
        base_url=get_comfy_base_url(),
    )


@router.get("/automation/comfy-process/logs", response_model=ComfyLogsResponse)
def get_comfy_process_logs() -> ComfyLogsResponse:
    """Always a 200: a stopped or too-old ComfyUI is just unavailable."""
    lines = read_log_lines()
    if lines is None:
        return ComfyLogsResponse(available=False)

    return ComfyLogsResponse(lines=lines, available=True)


@router.get("/automation/comfy-process/presets/{name}", response_model=ComfyPresetTextResponse)
def get_comfy_process_preset(name: str) -> ComfyPresetTextResponse:
    try:
        return ComfyPresetTextResponse(name=name, content=read_comfy_preset_text(name))
    except ComfyWorkflowError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _map_workflow(body: ComfyWorkflowMapRequest) -> ComfyWorkflow:
    """A missing preset is a 404; one that will not parse raises."""
    if body.source is not None:
        try:
            return load_generation("", body.source.model_dump())
        except ValueError as exc:
            raise ComfyWorkflowError(str(exc)) from exc
    try:
        raw = read_comfy_preset_text(body.preset)
    except ComfyWorkflowError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return parse_comfy_workflow(raw, source=body.preset)


@router.post("/automation/comfy-process/map", response_model=ComfyPresetMapResponse)
def map_comfy_workflow(body: ComfyWorkflowMapRequest) -> ComfyPresetMapResponse:
    """A switch shows the branch it picks; a broken workflow says why."""
    try:
        workflow = _map_workflow(body)
    except ComfyWorkflowError as exc:
        return ComfyPresetMapResponse(name=body.preset, error=str(exc))

    try:
        values = resolve_custom_inputs(workflow, body.inputs)
    except ComfyWorkflowError:
        # A value the job would refuse draws the graph as saved.
        values = {}
    branch = extract_graph_branch(
        with_custom_inputs(workflow, deepcopy(workflow.prompt), values),
        workflow.output_node,
        source_node=workflow.input_node,
        prompt_node=workflow.prompt_node,
    )
    return ComfyPresetMapResponse(
        name=workflow.preset,
        branch=None if branch is None else ComfyOutputBranch.model_validate(asdict(branch)),
    )


@router.post("/automation/train-lora", response_model=JobResponse)
def start_train_lora_job(
    path: str = FOLDER_QUERY, body: TrainLoraStartRequest = TrainLoraStartRequest()
) -> JobResponse:
    return _start_job("train_lora", path, body)


@router.get("/automation/train-lora/template", response_model=TrainingTemplateResponse)
def get_train_lora_template(
    model: TrainingModel = Query("krea2_turbo", description="Which model's template to read"),
) -> TrainingTemplateResponse:
    try:
        return TrainingTemplateResponse(model=model, yaml=read_training_template_text(model))
    except OstrisTrainingError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/automation/train-lora/template/check", response_model=TrainingTemplateCheckResponse)
def check_train_lora_template(
    body: TrainingTemplateCheckRequest,
) -> TrainingTemplateCheckResponse:
    """Whether an edited template would start; a 200 either way."""
    try:
        parse_training_template(body.template, source="edited training template")
    except OstrisTrainingError as exc:
        return TrainingTemplateCheckResponse(ok=False, error=str(exc))

    return TrainingTemplateCheckResponse(ok=True)
