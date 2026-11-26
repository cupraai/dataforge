import { EmptyState } from "@/shared/ui/EmptyState";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import { useEffect, useMemo, useState } from "react";
import { useJobs } from "@/features/jobs/context/JobsContext";
import { useJobHistory } from "@/features/jobs/hooks/useJobHistory";
import { JobTypeFilterMenu } from "@/features/jobs/components/JobTypeFilterMenu";
import {
  DEFAULT_JOB_FILTERS,
  isDefaultJobFilters,
  JOB_STATUS_FILTER_OPTIONS,
  jobHistoryStatusOf,
  jobsQueryFor,
  matchesJobFilters,
  mergeJobLists,
  type JobFilters,
} from "@/features/jobs/lib/jobFilters";
import { groupJobsForDrawer } from "@/features/jobs/lib/jobInsights";
import { isUnseenJob } from "@/features/jobs/lib/jobSeen";
import { DialogShell } from "@/shared/ui/DialogShell";
import {
  iconBot,
  iconFiles,
  iconFilterX,
  iconFolder,
  iconMessageWarning,
  iconScanSquare,
  iconTrash2,
  iconX,
} from "@/shared/icons";
import { foldersMatch } from "@/features/folder/lib/folderPath";
import { useTicker } from "@/shared/hooks/useTicker";
import { useUiSettings, useUpdateUiSettings } from "@/shared/preferences/uiPreferences";
import { classNames } from "@/shared/lib/classNames";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import {
  isActiveJobStatus,
  isTrainLoraCoTrackedByExternal,
  queueSpot,
  runningJobCount,
} from "@/features/jobs/lib/jobs";
import { ExternalJobCard } from "./ExternalJobCard";
import { VideoExportCard } from "./VideoExportCard";
import { Icon } from "@/shared/ui/Icon";
import { CancelJobDialog } from "./CancelJobDialog";
import { JobCard, type JobFollowUp } from "./JobCard";
import { JobsSectionTitle } from "./JobsSectionTitle";
import type { AutomationActions } from "@/features/automation/lib/automationActions";
import type { Job } from "@/shared/types";
import { reviewScopeSuffix } from "@/features/gallery/lib/reviewScope";

const RETICK_MS = 30_000;

/** The jobs that flag caption issues for the resolver. */
const ISSUE_JOB_TYPES: ReadonlySet<string> = new Set(["verify_captions", "check_caption_rules"]);

/** The open folder's automation handlers; cards for other folders get none. */
export type CurrentJobActions = Pick<
  AutomationActions,
  | "job"
  | "onOpenItem"
  | "onRetryFailed"
  | "reviewScope"
  | "issueCount"
  | "onResolveIssues"
  | "duplicateGroupCount"
  | "onResolveDuplicates"
  | "candidateCount"
  | "onReviewCandidates"
>;

interface JobsDialogProps {
  currentActions?: Partial<CurrentJobActions>;
  currentFolder?: string;
  onOpenFolder: (folderPath: string) => void;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The folder's review queues, offered on the job that filled them: its latest run. */
function followUpsFor(
  job: Job,
  actions: Partial<CurrentJobActions> | undefined,
  closeDrawer: () => void,
): JobFollowUp[] {
  if (!actions?.job || actions.job.id !== job.id || isActiveJobStatus(job.status)) return [];

  const thenClose = (action: (() => void) | undefined) => () => {
    closeDrawer();
    action?.();
  };
  const followUps: JobFollowUp[] = [];
  const { issueCount = 0, duplicateGroupCount = 0, candidateCount = 0 } = actions;
  const within = reviewScopeSuffix(actions.reviewScope);

  if (issueCount > 0 && actions.onResolveIssues && ISSUE_JOB_TYPES.has(job.job_type)) {
    followUps.push({
      label: `Review ${plural(issueCount, "issue")}${within}`,
      icon: iconMessageWarning,
      onClick: thenClose(actions.onResolveIssues),
    });
  }
  if (
    duplicateGroupCount > 0 &&
    actions.onResolveDuplicates &&
    job.job_type === "find_duplicates"
  ) {
    followUps.push({
      label: `Resolve ${plural(duplicateGroupCount, "duplicate group")}${within}`,
      icon: iconFiles,
      onClick: thenClose(actions.onResolveDuplicates),
    });
  }
  if (
    candidateCount > 0 &&
    actions.onReviewCandidates &&
    job.job_type === "comfy_run" &&
    !job.generates
  ) {
    followUps.push({
      label: `Review ${plural(candidateCount, "candidate")}${within}`,
      icon: iconScanSquare,
      onClick: thenClose(actions.onReviewCandidates),
    });
  }
  return followUps;
}

export function JobsDialog({ currentFolder, onOpenFolder, currentActions }: JobsDialogProps) {
  const {
    jobs,
    externalJobs,
    videoExports,
    cancelVideoExport,
    drawerOpen,
    closeDrawer,
    cancelJob,
    cancellingJobId,
    stoppingOstrisJobId,
    stopExternalOstrisJob,
    deleteJob,
    deleteAllJobs,
    seenAtMs,
    setShownJobFilter,
  } = useJobs();
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Job | null>(null);
  const { jobsDrawerFilters: filters } = useUiSettings();
  const updateUiSettings = useUpdateUiSettings();

  useEffect(() => {
    setShownJobFilter(
      isDefaultJobFilters(filters) ? null : (job) => matchesJobFilters(job, filters, currentFolder),
    );
    return () => setShownJobFilter(null);
  }, [filters, currentFolder, setShownJobFilter]);

  const nowMs = useTicker(RETICK_MS);

  // Starting, finishing or deleting a job changes which stored page is right; progress does not.
  const refreshKey = useMemo(
    () => jobs.map((job) => `${job.id}:${jobHistoryStatusOf(job.status)}`).join(","),
    [jobs],
  );
  // Memoized so the type list keeps its identity, and with it the history query key.
  const historyQuery = useMemo(
    () => jobsQueryFor(filters, currentFolder),
    [filters, currentFolder],
  );
  const history = useJobHistory(historyQuery, {
    enabled: drawerOpen,
    refreshKey,
  });

  const [closing, setClosing] = useState(false);
  const [renderedOpen, setRenderedOpen] = useState(drawerOpen);
  if (renderedOpen !== drawerOpen) {
    setRenderedOpen(drawerOpen);
    setClosing(renderedOpen && !drawerOpen);
  }

  const overlayAbove = !closing && (clearAllOpen || lightboxOpen || cancelTarget !== null);

  if (!drawerOpen && !closing) return null;

  const filtering = !isDefaultJobFilters(filters);
  const matches = (job: (typeof jobs)[number]) => matchesJobFilters(job, filters, currentFolder);
  // The live copy wins so progress keeps moving; re-filtering drops a job whose status moved on.
  const localJobs = mergeJobLists(jobs.filter(matches), history.jobs).filter(
    (job) => matches(job) && !isTrainLoraCoTrackedByExternal(job, externalJobs),
  );
  const sections = groupJobsForDrawer(localJobs, seenAtMs, nowMs);
  const hasLocalJobs = localJobs.length > 0;
  const hasExternalJobs = externalJobs.length > 0;
  const hasExports = videoExports.length > 0;
  const hasAnyJobs = hasLocalJobs || hasExternalJobs || hasExports;
  const hasHistory = jobs.length > 0 || history.total > 0 || filtering;
  const recordCount = filtering ? null : Math.max(history.total, jobs.length);
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const runningCount = runningJobCount(jobs, externalJobs) + videoExports.length - queuedCount;
  const newCount = jobs.filter((job) => isUnseenJob(job, seenAtMs)).length;
  const summary = [
    runningCount > 0 && `${runningCount} running`,
    queuedCount > 0 && `${queuedCount} queued`,
    newCount > 0 && `${newCount} new`,
  ].filter(Boolean);
  const changeFilters = (next: JobFilters) => updateUiSettings({ jobsDrawerFilters: next });
  const updateFilter = (patch: Partial<JobFilters>) => changeFilters({ ...filters, ...patch });
  const folderFilterOn = Boolean(currentFolder) && filters.folder === "current";

  const filteredEmpty = (
    <EmptyState
      size="sm"
      variant="muted"
      icon={iconFilterX}
      title={history.loading ? "Loading job history..." : "No jobs match these filters."}
      action={
        <Button onClick={() => changeFilters(DEFAULT_JOB_FILTERS)} size="sm">
          Clear filters
        </Button>
      }
    />
  );

  const runClearAll = async () => {
    setClearingAll(true);
    try {
      if (await deleteAllJobs()) setClearAllOpen(false);
    } finally {
      setClearingAll(false);
    }
  };

  const openFolder = (folderPath: string) => {
    onOpenFolder(folderPath);
    closeDrawer();
  };

  const renderJobCard = (job: Job) => {
    const inCurrentFolder = foldersMatch(job.folder, currentFolder);
    const actions = inCurrentFolder ? currentActions : undefined;

    return (
      <JobCard
        key={job.id}
        job={job}
        isNew={isUnseenJob(job, seenAtMs)}
        nowMs={nowMs}
        isCurrentFolder={inCurrentFolder}
        queueSpot={queueSpot(job, jobs)}
        onOpenFolder={openFolder}
        onOpenItem={
          actions?.onOpenItem
            ? (path) => {
                // A miss keeps the drawer open, so another file can be picked from it.
                if (actions.onOpenItem?.(path) === "opened") closeDrawer();
              }
            : undefined
        }
        onRetryFailed={
          // A failed generation has no file to retry on; starting the job again is the retry.
          actions?.onRetryFailed && !job.generates
            ? (paths) => {
                closeDrawer();
                actions.onRetryFailed?.(job.job_type, paths);
              }
            : undefined
        }
        followUps={followUpsFor(job, actions, closeDrawer)}
        cancelling={cancellingJobId === job.id}
        onCancel={() => setCancelTarget(job)}
        onDelete={(jobId) => {
          void deleteJob(jobId).finally(() => history.reload());
        }}
        onLightboxOpenChange={setLightboxOpen}
      />
    );
  };

  return (
    <>
      <DialogShell
        block="jobs-dialog"
        panelId="jobs-dialog-panel"
        labelledById="jobs-dialog-title"
        onClose={closeDrawer}
        suspended={overlayAbove}
        scrollLock="jobs-dialog-open"
        backdropLabel="Close jobs panel"
        enterAnimation="none"
        closing={closing}
        onExited={() => setClosing(false)}
      >
        <header className="jobs-dialog__header">
          <div className="jobs-dialog__title">
            <Icon icon={iconBot} className="jobs-dialog__title-icon" />
            <div className="jobs-dialog__title-text">
              <h2 id="jobs-dialog-title">Automation jobs</h2>
              {/* Always present, so filtering down to nothing does not shift the header. */}
              <p className="jobs-dialog__summary">
                {summary.length > 0
                  ? summary.join(" · ")
                  : hasHistory || hasAnyJobs
                    ? "Nothing running"
                    : "No jobs yet"}
              </p>
            </div>
          </div>

          <div className="jobs-dialog__header-actions">
            {(jobs.length > 0 || history.total > 0) && (
              <IconButton
                icon={iconTrash2}
                label="Delete all jobs"
                onClick={() => setClearAllOpen(true)}
                tone="danger"
              />
            )}

            <IconButton icon={iconX} label="Close" onClick={closeDrawer} tooltip={false} />
          </div>
        </header>

        {hasHistory && (
          <div className="jobs-dialog__filters" role="group" aria-label="Filter jobs">
            <SegmentedControl
              label="Status"
              value={filters.status}
              options={JOB_STATUS_FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.value === "all" ? "All" : option.title,
              }))}
              stretch
              onChange={(status) => updateFilter({ status })}
            />

            <div className="jobs-dialog__refine">
              <JobTypeFilterMenu
                value={filters.jobTypes}
                onChange={(jobTypes) => updateFilter({ jobTypes })}
              />
              <Button
                icon={iconFolder}
                size="sm"
                pressed={folderFilterOn}
                disabled={!currentFolder}
                onClick={() => updateFilter({ folder: folderFilterOn ? "all" : "current" })}
              >
                This folder
              </Button>
            </div>
          </div>
        )}

        <div className="jobs-dialog__content" data-scroll-lock-allow>
          {history.error && (
            <p className="jobs-dialog__error" role="alert">
              Could not load job history. {history.error}
            </p>
          )}
          {!hasAnyJobs && filtering ? (
            filteredEmpty
          ) : !hasAnyJobs ? (
            <EmptyState
              size="sm"
              variant="muted"
              icon={iconBot}
              title={history.loading ? "Loading job history..." : "No automation jobs yet."}
              description={
                history.loading
                  ? undefined
                  : "Start one from a folder with media files using the Tools menu."
              }
            />
          ) : (
            <>
              {hasExports && (
                <section className="jobs-dialog__section" aria-label="Video exports">
                  <JobsSectionTitle>Video exports</JobsSectionTitle>
                  <div className="jobs-dialog__list">
                    {videoExports.map((item) => (
                      <VideoExportCard
                        key={`export-${item.id}`}
                        item={item}
                        isCurrentFolder={foldersMatch(currentFolder, item.folder)}
                        onOpenFolder={openFolder}
                        onCancel={cancelVideoExport}
                      />
                    ))}
                  </div>
                </section>
              )}
              {hasExternalJobs && (
                <section className="jobs-dialog__section" aria-label="External jobs">
                  <JobsSectionTitle>AI-Toolkit</JobsSectionTitle>
                  <div className="jobs-dialog__list">
                    {externalJobs.map((job) => (
                      <ExternalJobCard
                        key={`ostris-${job.id}`}
                        job={job}
                        isCurrentFolder={foldersMatch(currentFolder, job.dataset_folder)}
                        onOpenFolder={openFolder}
                        stopping={stoppingOstrisJobId === job.id}
                        onStop={(jobId) => {
                          stopExternalOstrisJob(jobId).catch(() => {});
                        }}
                        onLightboxOpenChange={setLightboxOpen}
                      />
                    ))}
                  </div>
                </section>
              )}
              {(hasLocalJobs || filtering) && (
                <div className="jobs-dialog__local" role="region" aria-label="DataForge jobs">
                  {!hasLocalJobs ? (
                    filteredEmpty
                  ) : (
                    <>
                      {sections.map((section) => (
                        <section
                          key={section.id}
                          className={classNames(
                            "jobs-dialog__section",
                            `jobs-dialog__section--${section.id}`,
                          )}
                          aria-labelledby={`jobs-dialog-section-${section.id}`}
                        >
                          <JobsSectionTitle id={`jobs-dialog-section-${section.id}`}>
                            {section.label}
                            <span className="jobs-dialog__section-count">
                              {section.jobs.length}
                            </span>
                          </JobsSectionTitle>
                          <div className="jobs-dialog__list">{section.jobs.map(renderJobCard)}</div>
                        </section>
                      ))}
                      {history.hasMore && (
                        <div className="jobs-dialog__more">
                          <span className="jobs-dialog__more-count">
                            Showing {history.jobs.length} of {history.total}
                          </span>
                          <Button
                            className="jobs-dialog__load-more"
                            onClick={history.loadMore}
                            disabled={history.loading}
                            size="sm"
                          >
                            {history.loading ? "Loading..." : "Load more"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogShell>

      {cancelTarget && !closing && (
        <CancelJobDialog
          job={cancelTarget}
          onConfirm={() => {
            setCancelTarget(null);
            cancelJob(cancelTarget.id).catch(() => {});
          }}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      {clearAllOpen && !closing && (
        <ConfirmDialog
          title="Delete all job records?"
          description={
            recordCount === null
              ? "This permanently removes every job record from history, not just the filtered ones. Running jobs will be cancelled first."
              : `This permanently removes all ${recordCount} job record${recordCount === 1 ? "" : "s"} from history. Running jobs will be cancelled first.`
          }
          confirmLabel={clearingAll ? "Deleting..." : "Delete all"}
          confirmVariant="danger"
          busy={clearingAll}
          onConfirm={() => {
            void runClearAll();
          }}
          onCancel={() => {
            if (!clearingAll) setClearAllOpen(false);
          }}
        />
      )}
    </>
  );
}
