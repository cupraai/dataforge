import { Fragment } from "react";
import { jobMenuLabelFor, jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import type { WorkflowActions } from "@/features/workflows/hooks/useWorkflowHost";
import { COLLAPSIBLE_LABEL_CLASS, useToolbarCompact } from "@/features/gallery/lib/toolbarCompact";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import {
  iconChevronDown,
  iconChevronRight,
  iconLoader2,
  iconPlus,
  iconSettings,
  iconWorkflow,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import type { Workflow } from "@/shared/types";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";

/** The toolbar's Workflows button: run a saved workflow on the current scope, or edit them. */
export function WorkflowsMenu({ actions }: { actions: WorkflowActions }) {
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  const compact = useToolbarCompact();
  const { workflows, startingWorkflow } = actions;
  const edit = (name: string | null) => {
    close();
    actions.onEditWorkflows(name);
  };

  return (
    <>
      <div ref={rootRef}>
        <Tooltip content="Workflows" disabled={!compact}>
          <button
            type="button"
            className="workspace-button"
            aria-busy={startingWorkflow ? true : undefined}
            {...triggerProps}
          >
            <Icon
              icon={startingWorkflow ? iconLoader2 : iconWorkflow}
              spin={Boolean(startingWorkflow)}
            />
            <span className={COLLAPSIBLE_LABEL_CLASS}>Workflows</span>
            <Icon icon={iconChevronDown} />
          </button>
        </Tooltip>
      </div>
      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        id={menuId}
        placement="bottom-start"
        className="workspace-workflows"
        role="menu"
        label="Workflows"
      >
        {workflows.length === 0 ? (
          <div className="workspace-workflows__empty">
            <span className="workspace-workflows__empty-icon">
              <Icon icon={iconWorkflow} />
            </span>
            <p className="workspace-workflows__empty-title">No workflows yet</p>
            <p className="workspace-workflows__empty-text">
              Chain jobs with their own settings, such as Resize, Auto-caption and Lint captions,
              then run them on a folder in one click.
            </p>
            <button
              type="button"
              role="menuitem"
              className="workspace-workflows__create"
              onClick={() => edit(null)}
            >
              <Icon icon={iconPlus} />
              Create a workflow
            </button>
          </div>
        ) : (
          <>
            <div className="workspace-workflows__header" role="none">
              <span className="workspace-workflows__heading">
                Run a workflow
                <span className="workspace-workflows__count">{workflows.length}</span>
              </span>
              <button
                type="button"
                role="menuitem"
                className="workspace-workflows__manage"
                onClick={() => edit(workflows[0].name)}
              >
                <Icon icon={iconSettings} />
                Manage
              </button>
            </div>
            <div className="workspace-workflows__list" role="none">
              {workflows.map((workflow) => (
                <WorkflowRow
                  key={workflow.name}
                  workflow={workflow}
                  starting={startingWorkflow === workflow.name}
                  disabled={startingWorkflow !== null}
                  onRun={() => {
                    close();
                    actions.onRunWorkflow(workflow.name);
                  }}
                />
              ))}
            </div>
            <div className="workspace-workflows__footer" role="none">
              <button
                type="button"
                role="menuitem"
                className="workspace-workflows__new"
                onClick={() => edit(null)}
              >
                <Icon icon={iconPlus} />
                New workflow
              </button>
            </div>
          </>
        )}
      </AnchoredLayer>
    </>
  );
}

interface WorkflowRowProps {
  workflow: Workflow;
  starting: boolean;
  disabled: boolean;
  onRun: () => void;
}

/** Runs the workflow on click, after its confirmation. */
function WorkflowRow({ workflow, starting, disabled, onRun }: WorkflowRowProps) {
  const steps = workflow.steps.length;
  const chain = workflow.steps.map((step) => jobMenuLabelFor(step.job_type)).join(", then ");
  return (
    <div
      className={classNames(
        "workspace-workflows__row",
        starting && "workspace-workflows__row--starting",
      )}
      role="none"
    >
      <button
        type="button"
        role="menuitem"
        className="workspace-workflows__run"
        disabled={disabled}
        aria-label={`Run ${workflow.name}: ${chain}`}
        onClick={onRun}
      >
        <span className="workspace-workflows__icon">
          <Icon icon={starting ? iconLoader2 : iconWorkflow} spin={starting} />
        </span>
        <span className="workspace-workflows__text">
          <span className="workspace-workflows__name">{workflow.name}</span>
          <span className="workspace-workflows__chain" aria-hidden="true">
            {workflow.steps.map((step, index) => (
              // Steps have no identity of their own; their order is what the row shows.
              <Fragment key={`${index}-${step.job_type}`}>
                {index > 0 && (
                  <Icon icon={iconChevronRight} className="workspace-workflows__then" />
                )}
                <Icon icon={jobTypeIconFor(step.job_type)} />
              </Fragment>
            ))}
            <span className="workspace-workflows__steps">
              {steps === 1 ? "1 step" : `${steps} steps`}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
