import { EmptyState } from "@/shared/ui/EmptyState";
import { Button } from "@/shared/ui/Button";
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
import { Menu } from "@/shared/ui/Menu";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";

/** The toolbar's Workflows button: run a saved workflow on the current scope, or edit them. */
export function WorkflowsMenu({ actions }: { actions: WorkflowActions }) {
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
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
          {/* Not `busy`, which disables: the menu still opens while a run starts. */}
          <Button
            iconEnd={iconChevronDown}
            aria-busy={startingWorkflow ? true : undefined}
            {...triggerProps}
          >
            <Icon
              icon={startingWorkflow ? iconLoader2 : iconWorkflow}
              spin={Boolean(startingWorkflow)}
              className="button__icon"
            />
            <span className={COLLAPSIBLE_LABEL_CLASS}>Workflows</span>
          </Button>
        </Tooltip>
      </div>
      <Menu menu={menu} label="Workflows" placement="bottom-start" className="workspace-workflows">
        {workflows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={iconWorkflow}
            title="No workflows yet"
            description="Chain jobs with their own settings, such as Resize, Auto-caption and Lint captions, then run them on a folder in one click."
            action={
              <Button
                icon={iconPlus}
                role="menuitem"
                onClick={() => edit(null)}
                variant="primary"
                size="xs"
              >
                Create a workflow
              </Button>
            }
          />
        ) : (
          <>
            <div className="workspace-workflows__header" role="none">
              <span className="workspace-workflows__heading">
                Run a workflow
                <span className="workspace-workflows__count">{workflows.length}</span>
              </span>
              <Button
                icon={iconSettings}
                role="menuitem"
                onClick={() => edit(workflows[0].name)}
                size="xs"
              >
                Manage
              </Button>
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
              <Button
                icon={iconPlus}
                role="menuitem"
                className="workspace-workflows__new"
                onClick={() => edit(null)}
                size="sm"
              >
                New workflow
              </Button>
            </div>
          </>
        )}
      </Menu>
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
