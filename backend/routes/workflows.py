from fastapi import APIRouter, HTTPException, Query

import job_workflows
from automation.jobs import job_manager
from automation.selection import resolve_selected_media
from routes._helpers import job_response, resolve_folder
from schemas import (
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowSaveRequest,
    WorkflowsResponse,
)

router = APIRouter()


@router.get("/workflows", response_model=WorkflowsResponse)
def read_workflows() -> WorkflowsResponse:
    return job_workflows.list_workflows()


@router.put("/workflows", response_model=WorkflowsResponse)
def save_workflow(body: WorkflowSaveRequest) -> WorkflowsResponse:
    try:
        return job_workflows.save_workflow(body.workflow, body.previous_name)
    except job_workflows.WorkflowNameTakenError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except job_workflows.TooManyWorkflowsError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/workflows", response_model=WorkflowsResponse)
def delete_workflow(
    name: str = Query(..., description="The workflow's name, matched ignoring case"),
) -> WorkflowsResponse:
    return job_workflows.delete_workflow(name)


@router.post("/workflows/run", response_model=WorkflowRunResponse)
def run_workflow(
    body: WorkflowRunRequest,
    path: str = Query(..., description="Absolute path to the folder the workflow runs on"),
) -> WorkflowRunResponse:
    """Queue every step on one scope. Remembered dialog settings are left as they are: a
    workflow's settings are its own."""
    workflow = job_workflows.find_workflow(body.name)
    if workflow is None:
        raise HTTPException(status_code=404, detail=f'No workflow named "{body.name}"')

    folder = resolve_folder(path)
    try:
        selected_paths = resolve_selected_media(folder, body.paths)
        steps = [
            (step.job_type, {**step.settings.model_dump(), "selected_paths": selected_paths})
            for step in workflow.steps
        ]
        jobs = job_manager.queue_workflow(folder, steps, workflow.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return WorkflowRunResponse(jobs=[job_response(job) for job in jobs])
