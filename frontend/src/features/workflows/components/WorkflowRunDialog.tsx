import { jobMenuLabelFor, jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { stepSummary } from "@/features/workflows/lib/stepSummary";
import { iconInfo, iconWorkflow } from "@/shared/icons";
import type { Workflow } from "@/shared/types";
import { Dialog, DialogActions, DialogButton } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { Icon } from "@/shared/ui/Icon";

interface WorkflowRunDialogProps {
  workflow: Workflow;
  scope: DialogScopeInfo;
  busy?: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asked before a workflow queues its steps, so the scope and settings are seen first. */
export function WorkflowRunDialog({
  workflow,
  scope,
  busy = false,
  onEdit,
  onConfirm,
  onCancel,
}: WorkflowRunDialogProps) {
  const steps = workflow.steps.length;
  return (
    <Dialog
      title="Run workflow?"
      scope={scope}
      panelClassName="workflow-run-dialog"
      busy={busy}
      onConfirm={onConfirm}
      onClose={onCancel}
      footer={
        <>
          <div className="workflow-run-dialog__edit">
            <DialogButton
              label="Edit workflow..."
              variant="secondary"
              disabled={busy}
              onClick={onEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.stopPropagation();
              }}
            />
          </div>
          <DialogActions confirmLabel="Run workflow" busyLabel="Queueing..." onCancel={onCancel} />
        </>
      }
    >
      <div className="workflow-run-dialog__hero">
        <span className="workflow-run-dialog__hero-icon">
          <Icon icon={iconWorkflow} />
        </span>
        <span className="workflow-run-dialog__hero-text">
          <span className="workflow-run-dialog__hero-name">{workflow.name}</span>
          <span className="workflow-run-dialog__hero-meta">
            {steps === 1 ? "1 step" : `${steps} steps`}, queued in this order
          </span>
        </span>
      </div>

      <ol className="workflow-timeline workflow-run-dialog__steps" aria-label="Steps">
        {workflow.steps.map((step, index) => (
          // Steps have no identity of their own; their order is what the list shows.
          <li key={`${index}-${step.job_type}`} className="workflow-timeline__item">
            <span className="workflow-timeline__node" aria-hidden="true">
              {index + 1}
            </span>
            <div className="workflow-timeline__card">
              <span className="workflow-timeline__icon">
                <Icon icon={jobTypeIconFor(step.job_type)} />
              </span>
              <span className="workflow-timeline__text">
                <span className="workflow-timeline__label">{jobMenuLabelFor(step.job_type)}</span>
                <span className="workflow-timeline__summary">{stepSummary(step)}</span>
              </span>
            </div>
          </li>
        ))}
      </ol>

      <p className="workflow-run-dialog__note">
        <Icon icon={iconInfo} />
        Each step starts when the one before it finishes cleanly. If a step fails, is cancelled or
        leaves failed files, the steps after it are cancelled.
      </p>
    </Dialog>
  );
}
