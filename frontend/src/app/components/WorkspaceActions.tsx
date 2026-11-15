import { ProgressBar } from "@/shared/ui/ProgressBar";
import { IconButton } from "@/shared/ui/IconButton";
import { Button } from "@/shared/ui/Button";
import { useState, type KeyboardEvent } from "react";
import type { AutomationActions } from "@/features/automation/lib/automationActions";
import {
  JOB_GROUPS,
  JOB_TYPE_META,
  jobMenuLabelFor,
  jobStartBlock,
  jobTypeIconFor,
  jobTypeLabelFor,
} from "@/features/jobs/lib/jobMeta";
import {
  isActiveJobStatus,
  jobErrorMessage,
  jobIsCancelled,
  jobShowsErrorState,
  jobShowsWarningState,
  jobTypeLabel,
  jobWarningMessage,
  workflowRunLabel,
  progressPercent,
} from "@/features/jobs/lib/jobs";
import { CancelJobDialog } from "@/features/jobs/components/CancelJobDialog";
import { WorkflowsMenu } from "@/features/workflows/components/WorkflowsMenu";
import { JobStatusBadge } from "@/features/jobs/components/JobStatusBadge";
import { useJobTimeLabel } from "@/features/jobs/hooks/useJobTimeLabel";
import { failedCountFromStats } from "@/features/jobs/lib/jobFileResults";
import { dismissJob, readDismissedJobIds } from "@/features/jobs/lib/jobSeen";
import { Menu, MenuFooter, MenuItem } from "@/shared/ui/Menu";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";
import {
  iconHammer,
  iconMessageWarning,
  iconCpu,
  iconFiles,
  iconScanSquare,
  iconChevronDown,
  iconBan,
  iconListOrdered,
  iconCircleAlert,
  iconSearchCheck,
  iconTriangleAlert,
  iconX,
} from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { AutomationSystemSpecs } from "@/features/automation/components/AutomationSystemSpecs";
import { useAutomationSpecsVisible } from "@/features/automation/hooks/useAutomationSpecsVisible";
import { COLLAPSIBLE_LABEL_CLASS, useToolbarCompact } from "@/features/gallery/lib/toolbarCompact";
import { ScopeNote } from "@/features/gallery/components/ScopeNote";

interface ToolsMenuProps {
  panel: AutomationActions;
}

type ToolsMenuItemsProps = ToolsMenuProps & { onPick: () => void };

function ToolsGroup({
  group,
  panel,
  onPick,
}: ToolsMenuItemsProps & { group: (typeof JOB_GROUPS)[number] }) {
  return (
    <div role="group" aria-label={group.label} className="workspace-tools__group">
      <div className="workspace-tools__group-label" aria-hidden="true">
        {group.label}
      </div>
      {group.types.map((type) => {
        const { blocked, reason } = jobStartBlock(type, panel.startContext);
        return (
          <Tooltip
            key={type}
            placement="right"
            className="workspace-tools__tip"
            content={
              <>
                {JOB_TYPE_META[type].menuDescription}
                {reason && <span className="workspace-tools__reason">{reason}</span>}
              </>
            }
          >
            <MenuItem
              icon={jobTypeIconFor(type)}
              label={jobMenuLabelFor(type)}
              disabled={blocked}
              onSelect={() => {
                onPick();
                panel.onRequestStart(type);
              }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

const COLUMN_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * Left and Right move to the same row of the neighbouring group, wrapping around; a disabled
 * tool there hands focus to its nearest enabled neighbour. Up and Down stay with the menu.
 */
function moveAcrossGroups(event: KeyboardEvent<HTMLDivElement>) {
  const step = COLUMN_STEPS[event.key];
  if (!step) return;
  const groups = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="group"]')];
  const itemsOf = (group: HTMLElement) => [
    ...group.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ];
  const from = groups.findIndex((group) => group.contains(document.activeElement));
  if (from < 0) return;
  const row = itemsOf(groups[from]).indexOf(document.activeElement as HTMLButtonElement);
  for (let offset = 1; offset < groups.length; offset += 1) {
    const items = itemsOf(groups[(from + step * offset + groups.length) % groups.length]);
    const target = Math.min(row, items.length - 1);
    const enabled = items
      .map((item, index) => ({ item, distance: Math.abs(index - target) }))
      .filter(({ item }) => !item.disabled)
      .sort((a, b) => a.distance - b.distance);
    if (enabled.length > 0) {
      event.preventDefault();
      enabled[0].item.focus();
      return;
    }
  }
}

function ToolsMenuItems(props: ToolsMenuItemsProps) {
  return (
    <>
      <div className="workspace-tools__groups" role="presentation" onKeyDown={moveAcrossGroups}>
        {JOB_GROUPS.map((group) => (
          <ToolsGroup key={group.id} group={group} {...props} />
        ))}
      </div>
      <MenuFooter>
        <ScopeNote scope={props.panel.reviewScope} />
        <span>Hover a tool for details</span>
      </MenuFooter>
    </>
  );
}

function ToolsMenu(props: ToolsMenuProps) {
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
  const compact = useToolbarCompact();
  return (
    <>
      <div ref={rootRef}>
        <Tooltip content="Tools" disabled={!compact}>
          <Button icon={iconHammer} iconEnd={iconChevronDown} {...triggerProps}>
            <span className={COLLAPSIBLE_LABEL_CLASS}>Tools</span>
          </Button>
        </Tooltip>
      </div>
      <Menu menu={menu} label="Tools" placement="bottom-start" className="workspace-tools">
        <ToolsMenuItems
          {...props}
          onPick={() => {
            // The job dialog restores focus to the element focused when it opened.
            rootRef.current?.querySelector("button")?.focus();
            close();
          }}
        />
      </Menu>
    </>
  );
}

function ReviewMenu({ panel }: { panel: AutomationActions }) {
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
  const queues = [
    {
      label: "Caption issues",
      icon: iconMessageWarning,
      tone: "warning",
      count: panel.issueCount ?? 0,
      action: panel.onResolveIssues,
    },
    {
      label: "Duplicate groups",
      icon: iconFiles,
      tone: "accent",
      count: panel.duplicateGroupCount ?? 0,
      action: panel.onResolveDuplicates,
    },
    {
      label: "Pending candidates",
      icon: iconScanSquare,
      tone: "accent",
      count: panel.candidateCount ?? 0,
      action: panel.onReviewCandidates,
    },
  ];
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);
  // Nothing to review: the button would only ever open a list of disabled rows.
  if (total === 0) return null;
  return (
    <>
      <div ref={rootRef}>
        <Button icon={iconSearchCheck} iconEnd={iconChevronDown} {...triggerProps}>
          Review <span className="workspace-actions__count">{total}</span>
        </Button>
      </div>
      <Menu menu={menu} label="Review queues" placement="bottom-start" className="workspace-review">
        {queues.map((queue) => (
          <MenuItem
            key={queue.label}
            icon={queue.icon}
            label={queue.label}
            count={queue.count}
            className={`workspace-review__item--${queue.tone}`}
            disabled={!queue.action || queue.count === 0}
            onSelect={() => {
              close();
              queue.action?.();
            }}
          />
        ))}
        <MenuFooter>
          <ScopeNote scope={panel.reviewScope} />
        </MenuFooter>
      </Menu>
    </>
  );
}

/** Folder actions that sit in the toolbar row. */
export function WorkspaceActions({ panel }: ToolsMenuProps) {
  const { showSpecs, toggleSpecs } = useAutomationSpecsVisible();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const job = panel.job;
  const active = Boolean(job && isActiveJobStatus(job.status));

  return (
    <div className="workspace-actions">
      {active && (
        <Button
          icon={iconBan}
          busy={panel.cancellingJob}
          variant="warning"
          onClick={() => setConfirmingCancel(true)}
        >
          Cancel job
        </Button>
      )}
      <ToolsMenu panel={panel} />
      <WorkflowsMenu actions={panel.workflows} scope={panel.reviewScope} />
      <ReviewMenu panel={panel} />
      <IconButton
        icon={iconCpu}
        label="Toggle system specifications"
        shape="round"
        tooltip={showSpecs ? "Hide system specifications" : "Show system specifications"}
        onClick={toggleSpecs}
        aria-expanded={showSpecs}
        aria-controls={showSpecs ? "workspace-system-specs" : undefined}
      />
      {confirmingCancel && job && active && (
        <CancelJobDialog
          job={job}
          queuedCount={panel.queuedJobs.length}
          onConfirm={() => {
            setConfirmingCancel(false);
            panel.onCancelJob();
          }}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </div>
  );
}

function jobTone(job: AutomationActions["job"]) {
  if (!job) return null;
  if (jobShowsErrorState(job)) return "error";
  if (jobIsCancelled(job)) return "cancelled";
  if (jobShowsWarningState(job)) return "warning";
  return null;
}

/**
 * The current job's progress and outcome beneath the toolbar. A job that finished cleanly needs
 * no attention, so only running, failed, cancelled, or warning jobs show here.
 */
export function WorkspaceActivity({ panel }: { panel: AutomationActions }) {
  const { showSpecs } = useAutomationSpecsVisible();
  const [dismissedJobIds, setDismissedJobIds] = useState(readDismissedJobIds);
  const job = panel.job;
  const timeLabel = useJobTimeLabel(job);
  const active = Boolean(job && isActiveJobStatus(job.status));
  const queued = panel.queuedJobs;
  const tone = jobTone(job);
  const failedCount = job && !active ? failedCountFromStats(job.stats) : 0;
  const needsAttention = tone !== null || failedCount > 0;
  const visible = job && (active || (needsAttention && !dismissedJobIds.includes(job.id)));
  const failedNote =
    failedCount > 0
      ? `${failedCount} ${failedCount === 1 ? "file" : "files"} failed. Open automation jobs to view them and retry.`
      : null;
  const message = job ? (jobErrorMessage(job) ?? jobWarningMessage(job) ?? failedNote) : null;

  return (
    <>
      {visible && job && (
        <div className="workspace-activity" role="status">
          <div className="workspace-activity__row">
            <span className="workspace-activity__job">
              <Icon icon={jobTypeIconFor(job.job_type)} />
              <strong>{jobTypeLabelFor(job.job_type)}</strong>
            </span>
            {job.workflow_run && (
              <span className="workspace-activity__count">{workflowRunLabel(job)}</span>
            )}
            <JobStatusBadge job={job} />
            {job.total > 0 && (
              <span className="workspace-activity__count">
                {job.processed} of {job.total} {job.job_type === "train_lora" ? "steps" : "files"}
              </span>
            )}
            {!active && timeLabel && <span className="workspace-activity__count">{timeLabel}</span>}
            {active && job.current_name && (
              <span className="workspace-activity__current" title={job.current_name}>
                {job.current_name}
              </span>
            )}
            {active && (
              <ProgressBar
                className="workspace-activity__progress"
                value={progressPercent(job)}
                label="Job progress"
                tone={tone}
              />
            )}
            {active && <span className="workspace-activity__percent">{progressPercent(job)}%</span>}
            {active && timeLabel && <span className="workspace-activity__count">{timeLabel}</span>}
            {queued.length > 0 && (
              <Tooltip content={`Then: ${queued.map(jobTypeLabel).join(", ")}`}>
                <span className="workspace-activity__queue">
                  <Icon icon={iconListOrdered} />
                  {queued.length} queued
                </span>
              </Tooltip>
            )}
            {!active && (
              <IconButton
                icon={iconX}
                label="Dismiss job status"
                size="sm"
                tooltip={false}
                className="workspace-activity__dismiss"
                onClick={() => setDismissedJobIds(dismissJob(job.id))}
              />
            )}
          </div>
          {message && (
            <p
              className={classNames(
                "workspace-activity__message",
                jobErrorMessage(job) && "workspace-activity__message--error",
              )}
              role={jobErrorMessage(job) ? "alert" : undefined}
            >
              <Icon icon={jobErrorMessage(job) ? iconCircleAlert : iconTriangleAlert} />
              {message}
            </p>
          )}
        </div>
      )}
      {showSpecs && (
        <div className="workspace-system">
          <AutomationSystemSpecs id="workspace-system-specs" open />
        </div>
      )}
    </>
  );
}
