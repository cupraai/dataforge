from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from captions import build_caption_response, load_backup_caption, save_caption
from comfy_editor_workflow import workflow_for_output
from comfy_metadata import media_has_comfy_workflow
from comfy_prompts import (
    MapNode,
    Parameter,
    PromptText,
    SamplingStage,
    SharedSettings,
    extract_workflow_prompts,
    read_editor_workflow,
)
from constants import COMFY_WORKFLOW_EXTENSIONS
from external.comfy_workflows import ComfyWorkflow, generation_seed_nodes
from routes._helpers import resolve_captioned_file, resolve_media_file
from schemas import (
    CaptionBackupResponse,
    CaptionSaveResponse,
    CaptionUpdate,
    ComfyEditorWorkflowResponse,
    ComfyEmbeddedGeneration,
    ComfyMapNode,
    ComfyOutputBranch,
    ComfyParameter,
    ComfyPresetInput,
    ComfyPromptText,
    ComfySamplingStage,
    ComfySharedSettings,
    ComfyWorkflowPromptsResponse,
    PngWorkflowResponse,
)

router = APIRouter()


def _resolve_comfy_media(path: str) -> Path:
    file_path = resolve_media_file(path)
    if file_path.suffix.lower() not in COMFY_WORKFLOW_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="ComfyUI workflow metadata is only supported for PNG, MP4, MOV, and M4V files",
        )
    return file_path


def _generation(workflow: ComfyWorkflow | None) -> ComfyEmbeddedGeneration | None:
    if workflow is None:
        return None
    return ComfyEmbeddedGeneration(
        accepts_prompt=workflow.prompt_node is not None,
        accepts_seed=bool(generation_seed_nodes(workflow)),
        inputs=[
            ComfyPresetInput(name=entry.name, kind=entry.kind, default=entry.default)
            for entry in workflow.custom_inputs
        ],
        prompt_text=workflow.saved_prompt_text,
        source_kind=workflow.source_kind,
    )


def _prompt_text(prompt: PromptText) -> ComfyPromptText:
    return ComfyPromptText(
        role=prompt.role,
        text=prompt.text,
        node_id=prompt.node_id,
        node_title=prompt.node_title,
        input_name=prompt.input_name,
    )


def _parameters(parameters: list[Parameter]) -> list[ComfyParameter]:
    return [
        ComfyParameter(label=parameter.label, value=parameter.value) for parameter in parameters
    ]


def _map_node(node: MapNode) -> ComfyMapNode:
    return ComfyMapNode(
        id=node.id,
        kind=node.kind,
        label=node.label,
        detail=node.detail,
        status=node.status,
        feeds=node.feeds,
        role=node.role,
        media=node.media,
    )


def _sampling_stage(stage: SamplingStage) -> ComfySamplingStage:
    return ComfySamplingStage(
        node_id=stage.node_id,
        label=stage.label,
        group=stage.group,
        status=stage.status,
        parameters=_parameters(stage.parameters),
        loras=stage.loras,
    )


def _shared_settings(shared: SharedSettings) -> ComfySharedSettings:
    return ComfySharedSettings(
        passes=shared.passes, parameters=_parameters(shared.parameters), loras=shared.loras
    )


@router.get("/caption", response_model=CaptionSaveResponse)
def read_caption(
    path: str = Query(..., description="Absolute path to image or video file"),
) -> CaptionSaveResponse:
    file_path = resolve_captioned_file(path)
    return CaptionSaveResponse.model_validate(build_caption_response(file_path))


@router.get("/caption/backup", response_model=CaptionBackupResponse)
def read_caption_backup(
    path: str = Query(..., description="Absolute path to image or video file"),
) -> CaptionBackupResponse:
    file_path = resolve_captioned_file(path)
    description = load_backup_caption(file_path)
    return CaptionBackupResponse(exists=description is not None, description=description)


@router.get("/comfy-workflow", response_model=PngWorkflowResponse)
def read_comfy_workflow(
    path: str = Query(..., description="Absolute path to image or video file"),
) -> PngWorkflowResponse:
    return PngWorkflowResponse(has_workflow=media_has_comfy_workflow(_resolve_comfy_media(path)))


@router.get("/comfy-workflow/prompts", response_model=ComfyWorkflowPromptsResponse)
def read_comfy_workflow_prompts(
    path: str = Query(..., description="Absolute path to image or video file"),
) -> ComfyWorkflowPromptsResponse:
    file_path = _resolve_comfy_media(path)
    extracted = extract_workflow_prompts(file_path)

    return ComfyWorkflowPromptsResponse(
        has_workflow=extracted.has_workflow,
        branches=[
            ComfyOutputBranch(
                node_id=branch.node_id,
                class_type=branch.class_type,
                label=branch.label,
                filename_prefix=branch.filename_prefix,
                filename=branch.filename,
                is_preview=branch.is_preview,
                matches_filename=branch.matches_filename,
                mismatches=branch.mismatches,
                prompts=[_prompt_text(prompt) for prompt in branch.prompts],
                parameters=_parameters(branch.parameters),
                loras=branch.loras,
                stages=[_sampling_stage(stage) for stage in branch.stages],
                shared=[_shared_settings(shared) for shared in branch.shared],
                map=[_map_node(node) for node in branch.map],
                generation=_generation(branch.generation),
            )
            for branch in extracted.branches
        ],
        matched_node_id=extracted.matched_node_id,
        orphan_prompts=[_prompt_text(prompt) for prompt in extracted.orphan_prompts],
        has_editor_workflow=extracted.has_editor_workflow,
        matched_by=extracted.matched_by,
    )


@router.get("/comfy-workflow/editor", response_model=ComfyEditorWorkflowResponse)
def read_comfy_editor_workflow(
    path: str = Query(..., description="Absolute path to image or video file"),
    node_id: str = Query(..., description="Output node the workflow is trimmed to"),
) -> ComfyEditorWorkflowResponse:
    raw = read_editor_workflow(_resolve_comfy_media(path))
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail="This file carries no editor workflow that ComfyUI can load from a paste",
        )
    workflow = workflow_for_output(raw, node_id)
    if workflow is None:
        raise HTTPException(
            status_code=404, detail=f"Output node {node_id} is not in the editor workflow"
        )
    return ComfyEditorWorkflowResponse(workflow=workflow)


@router.put("/caption", response_model=CaptionSaveResponse)
def update_caption(
    path: str = Query(..., description="Absolute path to image or video file"),
    body: CaptionUpdate = ...,
) -> CaptionSaveResponse:
    file_path = resolve_captioned_file(path)

    try:
        result = save_caption(
            file_path,
            body.text,
            base_revision=body.base_revision,
            resolve_issue=body.resolve_issue,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Failed to write caption file") from exc

    return CaptionSaveResponse.model_validate(result)
