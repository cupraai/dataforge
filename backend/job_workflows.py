"""Saved workflows: named chains of jobs with their settings, shared by every folder."""

from __future__ import annotations

from constants import MAX_WORKFLOWS
from preferences import JsonPreference
from schemas import Workflow, WorkflowsResponse

WORKFLOWS_KEY = "workflows"

_store: JsonPreference[WorkflowsResponse] = JsonPreference(WORKFLOWS_KEY, WorkflowsResponse)


class TooManyWorkflowsError(ValueError):
    pass


class WorkflowNameTakenError(ValueError):
    pass


def _name_key(workflow: Workflow) -> str:
    return workflow.name.casefold()


def _sorted(workflows: list[Workflow]) -> WorkflowsResponse:
    ordered: list[Workflow] = sorted(workflows, key=_name_key)
    return WorkflowsResponse(workflows=ordered)


def list_workflows() -> WorkflowsResponse:
    return _store.get()


def find_workflow(name: str) -> Workflow | None:
    key = name.strip().casefold()
    return next((saved for saved in _store.get().workflows if _name_key(saved) == key), None)


def save_workflow(workflow: Workflow, previous_name: str | None = None) -> WorkflowsResponse:
    """Adds ``workflow``, or replaces the one saved as ``previous_name`` (its own name when
    ``None``), matching names ignoring case. A rename onto another workflow's name is refused."""
    key = _name_key(workflow)
    replaced = (previous_name or workflow.name).strip().casefold()
    saved = _store.get().workflows
    if key != replaced and any(_name_key(other) == key for other in saved):
        raise WorkflowNameTakenError(f'A workflow named "{workflow.name}" already exists')

    others = [other for other in saved if _name_key(other) not in {key, replaced}]
    if len(others) >= MAX_WORKFLOWS:
        raise TooManyWorkflowsError(
            f"At most {MAX_WORKFLOWS} workflows can be saved. Delete one first."
        )
    return _store.save(_sorted([*others, workflow]))


def delete_workflow(name: str) -> WorkflowsResponse:
    """Removing a name that is not saved changes nothing."""
    key = name.strip().casefold()
    return _store.save(_sorted([kept for kept in _store.get().workflows if _name_key(kept) != key]))
