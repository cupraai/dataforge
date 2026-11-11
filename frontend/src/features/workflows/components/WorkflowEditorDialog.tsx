import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AutomationDialogOverlays } from "@/features/automation/components/AutomationDialogOverlays";
import { useAutomationDialogOverlays } from "@/features/automation/hooks/useAutomationDialogOverlays";
import type { BulkScopeKind } from "@/features/automation/lib/bulkScope";
import { JOB_TYPE_META, jobMenuLabelFor, jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import {
  deleteWorkflow,
  saveWorkflow,
  WORKFLOWS_QUERY_KEY,
} from "@/features/workflows/api/workflows";
import { stepSummary } from "@/features/workflows/lib/stepSummary";
import {
  addStepBlock,
  emptyStep,
  moveStep,
  sameWorkflow,
  stepDialogSettings,
  stepFromBody,
  stepHasSettings,
  WORKFLOW_STEP_GROUPS,
  workflowStepsProblem,
  type WorkflowJobType,
} from "@/features/workflows/lib/workflowSteps";
import { formatApiError } from "@/shared/api/http";
import { MAX_WORKFLOW_NAME_LENGTH, MAX_WORKFLOW_STEPS } from "@/shared/constants";
import { useDiscardChanges } from "@/shared/hooks/useDiscardChanges";
import {
  iconArrowDown,
  iconArrowUp,
  iconGripVertical,
  iconPlay,
  iconPlus,
  iconSearch,
  iconSliders,
  iconTrash2,
  iconWorkflow,
  iconX,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import type { JobType, Workflow, WorkflowsResponse, WorkflowStep } from "@/shared/types";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { DialogButton } from "@/shared/ui/Dialog";
import { DialogShell } from "@/shared/ui/DialogShell";
import { DiscardChangesDialog } from "@/shared/ui/DiscardChangesDialog";
import { Icon } from "@/shared/ui/Icon";

/** What a step's own dialog needs to open over the editor: the folder it previews against. */
export interface WorkflowStepDialogContext {
  folderPath: string;
  folderLabel: string;
  itemCount: number;
  folderItemCount: number;
  scopeKind: BulkScopeKind;
  getJobPaths?: () => string[] | undefined;
  comfyPresetsAvailable: boolean;
}

interface WorkflowEditorDialogProps {
  workflows: readonly Workflow[];
  /** The workflow to open on; null starts a new one. */
  initialName: string | null;
  stepDialogs: WorkflowStepDialogContext;
  /** Closes the editor and asks to run the saved workflow on the current scope. */
  onRun?: (name: string) => void;
  onClose: () => void;
}

const NEW_WORKFLOW: Workflow = { name: "", steps: [] };

const STEP_MODE = {
  confirmLabel: "Save step",
  note: "Saved in the workflow. It runs on the files in scope when the workflow starts.",
};

/** Which step a dialog's confirmation fills: a new last step, or the one at `index`. */
type StepTarget = { kind: "add" } | { kind: "edit"; index: number };

function stepCount(count: number): string {
  return count === 1 ? "1 step" : `${count} steps`;
}

export function WorkflowEditorDialog({
  workflows,
  initialName,
  stepDialogs,
  onRun,
  onClose,
}: WorkflowEditorDialogProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const libraryId = useId();
  const statusId = useId();
  const opening = initialName
    ? (workflows.find((workflow) => workflow.name === initialName) ?? null)
    : null;
  // `savedName` is the name the draft is stored under; null for one never saved.
  const [savedName, setSavedName] = useState<string | null>(opening?.name ?? null);
  const [baseline, setBaseline] = useState<Workflow>(opening ?? NEW_WORKFLOW);
  const [draft, setDraft] = useState<Workflow>(opening ?? NEW_WORKFLOW);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filter, setFilter] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const targetRef = useRef<StepTarget>({ kind: "add" });

  const store = (response: WorkflowsResponse) =>
    queryClient.setQueryData(WORKFLOWS_QUERY_KEY, response);
  const save = useMutation({
    mutationFn: () => saveWorkflow(draft, savedName),
    onSuccess: (response) => {
      store(response);
      const key = draft.name.trim().toLowerCase();
      const settled = response.workflows.find((saved) => saved.name.toLowerCase() === key) ?? draft;
      setSavedName(settled.name);
      setBaseline(settled);
      setDraft(settled);
    },
  });
  const remove = useMutation({
    mutationFn: (name: string) => deleteWorkflow(name),
    onSuccess: store,
  });

  const dirty = !sameWorkflow(draft, baseline);
  const trimmedName = draft.name.trim();
  const nameTaken = workflows.some(
    (workflow) =>
      workflow.name.toLowerCase() === trimmedName.toLowerCase() &&
      workflow.name.toLowerCase() !== savedName?.toLowerCase(),
  );
  const problem = !trimmedName
    ? "Name the workflow to save it"
    : nameTaken
      ? `A workflow named "${trimmedName}" already exists`
      : workflowStepsProblem(draft.steps);
  const busy = save.isPending || remove.isPending;
  const canSave = dirty && problem === null && !busy;
  const failure = save.error ?? remove.error;
  const addBlock = addStepBlock(draft.steps);

  const setSteps = useCallback(
    (update: (steps: WorkflowStep[]) => WorkflowStep[]) =>
      setDraft((current) => ({ ...current, steps: update(current.steps) })),
    [],
  );

  // A step's own dialog, opened in step mode: confirming hands its start body here.
  const applyStepBody = useCallback(
    (jobType: JobType, _folder: string, body?: unknown) => {
      const step = stepFromBody(jobType as WorkflowJobType, body);
      const target = targetRef.current;
      setSteps((steps) =>
        target.kind === "add"
          ? [...steps, step]
          : steps.map((existing, index) => (index === target.index ? step : existing)),
      );
      return Promise.resolve(null);
    },
    [setSteps],
  );
  const { dialogs, openDialogForJobType } = useAutomationDialogOverlays({
    folderPath: stepDialogs.folderPath,
    folderLabel: stepDialogs.folderLabel,
    startingJobType: null,
    itemCount: stepDialogs.itemCount,
    folderItemCount: stepDialogs.folderItemCount,
    scopeKind: stepDialogs.scopeKind,
    startJob: applyStepBody,
    getJobPaths: stepDialogs.getJobPaths,
    stepMode: STEP_MODE,
  });
  const stepDialogOpen = Object.values(dialogs).some((dialog) => dialog.open);

  const discard = useDiscardChanges({
    unsavedChanges: dirty,
    busy,
    suspended: stepDialogOpen || confirmingDelete,
    onNavigationDiscard: onClose,
    description: "The changes to this workflow are not saved.",
  });
  const requestClose = () => void discard.request(onClose);

  const addStep = (type: WorkflowJobType) => {
    save.reset();
    if (!stepHasSettings(type)) {
      setSteps((steps) => [...steps, emptyStep(type)]);
      return;
    }
    targetRef.current = { kind: "add" };
    openDialogForJobType(type);
  };

  const editStep = (index: number) => {
    const step = draft.steps[index];
    targetRef.current = { kind: "edit", index };
    openDialogForJobType(step.job_type, { initialSettings: stepDialogSettings(step) });
  };

  const canMove = (from: number, to: number) =>
    to >= 0 &&
    to < draft.steps.length &&
    workflowStepsProblem(moveStep(draft.steps, from, to)) === null;

  const move = (from: number, to: number) => {
    if (!canMove(from, to)) return;
    setSteps((steps) => moveStep(steps, from, to));
  };

  const handleStepKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const to = event.key === "ArrowUp" ? index - 1 : index + 1;
    if (!canMove(index, to)) return;
    move(index, to);
    // Focus follows the moved card, so repeated presses keep moving the same step.
    const list = event.currentTarget.parentElement;
    const label =
      event.target instanceof HTMLElement ? event.target.getAttribute("aria-label") : null;
    requestAnimationFrame(() => {
      const card = list?.children.item(to);
      if (!(card instanceof HTMLElement)) return;
      const same = card.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]:not(:disabled)`,
      );
      (same ?? card.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
    });
  };

  const open = (name: string | null) => {
    const workflow = name ? workflows.find((saved) => saved.name === name) : null;
    save.reset();
    remove.reset();
    setSavedName(workflow?.name ?? null);
    setBaseline(workflow ?? NEW_WORKFLOW);
    setDraft(workflow ?? NEW_WORKFLOW);
  };

  const requestOpen = (name: string | null) => {
    if (name !== null && name === savedName) return;
    void discard.request(() => open(name));
  };

  const confirmDelete = () => {
    setConfirmingDelete(false);
    if (!savedName) {
      open(null);
      return;
    }
    remove.mutate(savedName, {
      onSuccess: (response) => {
        const next = response.workflows[0] ?? null;
        setSavedName(next?.name ?? null);
        setBaseline(next ?? NEW_WORKFLOW);
        setDraft(next ?? NEW_WORKFLOW);
      },
    });
  };

  const query = filter.trim().toLowerCase();
  const library = useMemo(
    () =>
      WORKFLOW_STEP_GROUPS.map((group) => ({
        ...group,
        types: group.types.filter(
          (type) => !query || jobMenuLabelFor(type).toLowerCase().includes(query),
        ),
      })).filter((group) => group.types.length > 0),
    [query],
  );

  const status = failure
    ? formatApiError(failure)
    : dirty && problem
      ? problem
      : dirty
        ? "Unsaved changes"
        : savedName
          ? "Saved. Each step starts when the one before it finishes cleanly."
          : "Name the workflow and add steps from the library.";
  const statusTone = failure || (dirty && problem) ? "error" : dirty ? "pending" : null;

  return (
    <DialogShell
      block="workflow-editor"
      labelledById={titleId}
      onClose={requestClose}
      busy={busy}
      suspended={stepDialogOpen || confirmingDelete || discard.confirming}
      backdropLabel="Close workflows"
    >
      <aside className="workflow-editor__sidebar">
        <h2 id={titleId} className="workflow-editor__brand">
          <Icon icon={iconWorkflow} className="workflow-editor__brand-icon" />
          Workflows
        </h2>
        <button
          type="button"
          className="workflow-editor__new"
          disabled={savedName === null}
          onClick={() => requestOpen(null)}
        >
          <Icon icon={iconPlus} />
          New workflow
        </button>
        <nav className="workflow-editor__nav" aria-label="Saved workflows">
          {savedName === null && (
            <WorkflowNavItem
              name={trimmedName || "Untitled workflow"}
              steps={draft.steps}
              current
              unsaved={dirty}
              onSelect={() => undefined}
            />
          )}
          {workflows.map((workflow) => {
            const current = workflow.name === savedName;
            return (
              <WorkflowNavItem
                key={workflow.name}
                name={current ? trimmedName || "Untitled workflow" : workflow.name}
                steps={current ? draft.steps : workflow.steps}
                current={current}
                unsaved={current && dirty}
                onSelect={() => requestOpen(workflow.name)}
              />
            );
          })}
        </nav>
        <p className="workflow-editor__tip">
          Workflows are shared by every folder. Run one from the toolbar's Workflows menu or from
          Quick actions.
        </p>
      </aside>

      <div className="workflow-editor__main">
        <header className="workflow-editor__header">
          <div className="workflow-editor__heading">
            <input
              className="workflow-editor__name"
              aria-label="Name"
              value={draft.name}
              maxLength={MAX_WORKFLOW_NAME_LENGTH}
              placeholder="Untitled workflow"
              autoComplete="off"
              aria-invalid={nameTaken || undefined}
              aria-describedby={statusId}
              onChange={(event) => {
                const name = event.target.value;
                setDraft((current) => ({ ...current, name }));
              }}
            />
            <p className="workflow-editor__meta">
              {stepCount(draft.steps.length)} of {MAX_WORKFLOW_STEPS} · runs on the files in scope
              when it starts
            </p>
          </div>
          <button
            type="button"
            className="workflow-editor__close"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close workflows"
          >
            <Icon icon={iconX} />
          </button>
        </header>

        <div className="workflow-editor__body">
          <section className="workflow-editor__canvas" aria-label="Workflow steps">
            {draft.steps.length === 0 ? (
              <div className="workflow-editor__empty">
                <span className="workflow-editor__empty-icon">
                  <Icon icon={iconWorkflow} />
                </span>
                <p className="workflow-editor__empty-title">No steps yet</p>
                <p className="workflow-editor__empty-text">
                  Pick jobs from the library. Each step keeps its own settings and starts when the
                  one before it finishes cleanly.
                </p>
              </div>
            ) : (
              <ol className="workflow-timeline" aria-label="Steps">
                {draft.steps.map((step, index) => {
                  const label = jobMenuLabelFor(step.job_type);
                  return (
                    /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
                       Alt+Arrow from the card's buttons moves the card */
                    <li
                      // Steps have no identity of their own; order and type are what a card is.
                      key={`${index}-${step.job_type}`}
                      className={classNames(
                        "workflow-timeline__item",
                        dragFrom === index && "workflow-timeline__item--dragging",
                        dropAt === index && dragFrom !== index && "workflow-timeline__item--drop",
                      )}
                      aria-label={`Step ${index + 1}: ${label}`}
                      onKeyDown={(event) => handleStepKeyDown(event, index)}
                      onDragOver={(event) => {
                        if (dragFrom === null || !canMove(dragFrom, index)) return;
                        event.preventDefault();
                        setDropAt(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragFrom !== null) move(dragFrom, index);
                        setDragFrom(null);
                        setDropAt(null);
                      }}
                    >
                      <span className="workflow-timeline__node" aria-hidden="true">
                        {index + 1}
                      </span>
                      <div className="workflow-timeline__card workflow-timeline__card--editable">
                        <span
                          className="workflow-timeline__grip"
                          draggable
                          aria-hidden="true"
                          title="Drag to reorder"
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(index));
                            setDragFrom(index);
                          }}
                          onDragEnd={() => {
                            setDragFrom(null);
                            setDropAt(null);
                          }}
                        >
                          <Icon icon={iconGripVertical} />
                        </span>
                        <span className="workflow-timeline__icon">
                          <Icon icon={jobTypeIconFor(step.job_type)} />
                        </span>
                        <span className="workflow-timeline__text">
                          <span className="workflow-timeline__label">{label}</span>
                          <span className="workflow-timeline__summary">{stepSummary(step)}</span>
                        </span>
                        <span className="workflow-timeline__actions">
                          {stepHasSettings(step.job_type) && (
                            <button
                              type="button"
                              className="workflow-timeline__settings"
                              aria-label={`Edit ${label} settings`}
                              onClick={() => editStep(index)}
                            >
                              <Icon icon={iconSliders} />
                              <span className="workflow-timeline__settings-label">Settings</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="workflow-timeline__button"
                            aria-label={`Move ${label} up`}
                            aria-keyshortcuts="Alt+ArrowUp"
                            title="Move up (Alt+Up)"
                            disabled={!canMove(index, index - 1)}
                            onClick={() => move(index, index - 1)}
                          >
                            <Icon icon={iconArrowUp} />
                          </button>
                          <button
                            type="button"
                            className="workflow-timeline__button"
                            aria-label={`Move ${label} down`}
                            aria-keyshortcuts="Alt+ArrowDown"
                            title="Move down (Alt+Down)"
                            disabled={!canMove(index, index + 1)}
                            onClick={() => move(index, index + 1)}
                          >
                            <Icon icon={iconArrowDown} />
                          </button>
                          <button
                            type="button"
                            className="workflow-timeline__button workflow-timeline__button--danger"
                            aria-label={`Remove ${label}`}
                            title="Remove step"
                            onClick={() =>
                              setSteps((steps) => steps.filter((_, at) => at !== index))
                            }
                          >
                            <Icon icon={iconTrash2} />
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="workflow-library" aria-labelledby={libraryId}>
            <div className="workflow-library__header">
              <h3 id={libraryId} className="workflow-library__title">
                Add a step
              </h3>
              <p className="workflow-library__hint">
                {addBlock ?? "Steps are added at the end. Jobs with settings open their dialog."}
              </p>
              <label className="workflow-library__search">
                <Icon icon={iconSearch} />
                <input
                  type="search"
                  aria-label="Filter jobs"
                  placeholder="Filter jobs"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
            </div>
            <div className="workflow-library__groups">
              {library.map((group) => (
                <div key={group.label} className="workflow-library__group">
                  <p className="workflow-library__group-label">{group.label}</p>
                  {group.types.map((type) => {
                    const unavailable =
                      type === "comfy_process" && !stepDialogs.comfyPresetsAvailable;
                    const label = jobMenuLabelFor(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        className="workflow-library__item"
                        aria-label={`Add ${label}`}
                        disabled={addBlock !== null || unavailable}
                        title={unavailable ? "Add a ComfyUI workflow preset first" : undefined}
                        onClick={() => addStep(type)}
                      >
                        <span className="workflow-library__icon">
                          <Icon icon={jobTypeIconFor(type)} />
                        </span>
                        <span className="workflow-library__text">
                          <span className="workflow-library__label">{label}</span>
                          <span className="workflow-library__description">
                            {JOB_TYPE_META[type].menuDescription}
                          </span>
                        </span>
                        <Icon icon={iconPlus} className="workflow-library__add" />
                      </button>
                    );
                  })}
                </div>
              ))}
              {library.length === 0 && (
                <p className="workflow-library__none">No job matches "{filter.trim()}".</p>
              )}
            </div>
          </section>
        </div>

        <footer className="workflow-editor__footer">
          <p
            id={statusId}
            className={classNames(
              "workflow-editor__status",
              statusTone && `workflow-editor__status--${statusTone}`,
            )}
            role={statusTone === "error" ? "alert" : undefined}
          >
            {status}
          </p>
          <div className="workflow-editor__actions">
            <DialogButton
              label="Delete"
              variant="secondary"
              icon={iconTrash2}
              disabled={busy || (savedName === null && draft.steps.length === 0 && !trimmedName)}
              onClick={() => setConfirmingDelete(true)}
            />
            {onRun && (
              <DialogButton
                label="Run..."
                variant="secondary"
                icon={iconPlay}
                disabled={busy || savedName === null || dirty}
                onClick={() => {
                  if (savedName) onRun(savedName);
                }}
              />
            )}
            <DialogButton
              label="Close"
              variant="secondary"
              disabled={busy}
              onClick={requestClose}
            />
            <DialogButton
              label={save.isPending ? "Saving..." : "Save"}
              variant="primary"
              busy={save.isPending}
              disabled={!canSave}
              onClick={() => save.mutate()}
            />
          </div>
        </footer>
      </div>

      <AutomationDialogOverlays dialogs={dialogs} />

      {discard.promptProps && <DiscardChangesDialog {...discard.promptProps} />}

      {confirmingDelete && (
        <ConfirmDialog
          title={savedName ? `Delete "${savedName}"?` : "Discard this workflow?"}
          description={
            savedName
              ? "The workflow is removed for every folder. Jobs it already ran are kept."
              : "The new workflow was never saved."
          }
          confirmLabel={savedName ? "Delete" : "Discard"}
          confirmVariant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </DialogShell>
  );
}

interface WorkflowNavItemProps {
  name: string;
  steps: readonly WorkflowStep[];
  current: boolean;
  unsaved: boolean;
  onSelect: () => void;
}

function WorkflowNavItem({ name, steps, current, unsaved, onSelect }: WorkflowNavItemProps) {
  return (
    <button
      type="button"
      className={classNames("workflow-editor__item", current && "workflow-editor__item--current")}
      aria-current={current || undefined}
      onClick={onSelect}
    >
      <span className="workflow-editor__item-text">
        <span className="workflow-editor__item-name">{name}</span>
        <span className="workflow-editor__item-chain" aria-hidden="true">
          {steps.length === 0
            ? "No steps"
            : steps.map((step, index) => (
                // Steps have no identity of their own; their order is what the row shows.
                <Icon key={`${index}-${step.job_type}`} icon={jobTypeIconFor(step.job_type)} />
              ))}
        </span>
      </span>
      {unsaved && <span className="workflow-editor__item-dot" aria-label="Unsaved" />}
    </button>
  );
}
