import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BulkScopeKind } from "@/features/automation/lib/bulkScope";
import { workflowsQueryOptions } from "@/features/workflows/api/workflows";
import type { WorkflowStepDialogContext } from "@/features/workflows/components/WorkflowEditorDialog";
import { foldersMatch } from "@/features/folder/lib/folderPath";
import { useChanged } from "@/shared/hooks/useChanged";
import type { Workflow } from "@/shared/types";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";

interface UseWorkflowHostOptions {
  folder: string | undefined;
  folderLabel: string;
  /** The scope a job started now would run on, without the queue note. */
  liveScope: DialogScopeInfo;
  scopeKind: BulkScopeKind;
  folderItemCount: number;
  getJobPaths: () => string[] | undefined;
  queuedAfter: string | undefined;
  comfyPresetsAvailable: boolean;
  runWorkflow: (folderPath: string, name: string, paths?: string[]) => Promise<unknown[] | null>;
  startingWorkflow: { folder: string; name: string } | null;
}

/** Saved workflows for the toolbar menu and Quick actions. */
export interface WorkflowActions {
  workflows: readonly Workflow[];
  /** The workflow whose run is being queued in this folder. */
  startingWorkflow: string | null;
  onRunWorkflow: (name: string) => void;
  /** Opens the editor on `name`, or on a new workflow when null. */
  onEditWorkflows: (name: string | null) => void;
}

export interface WorkflowOverlaysState {
  run: {
    workflow: Workflow;
    scope: DialogScopeInfo;
    busy: boolean;
    onConfirm: () => void;
    onEdit: () => void;
    onCancel: () => void;
  } | null;
  editor: {
    workflows: readonly Workflow[];
    initialName: string | null;
    stepDialogs: WorkflowStepDialogContext;
    onRun: (name: string) => void;
    onClose: () => void;
  } | null;
}

interface PendingRun {
  name: string;
  scope: DialogScopeInfo;
  paths: string[] | undefined;
}

export function useWorkflowHost({
  folder,
  folderLabel,
  liveScope,
  scopeKind,
  folderItemCount,
  getJobPaths,
  queuedAfter,
  comfyPresetsAvailable,
  runWorkflow,
  startingWorkflow,
}: UseWorkflowHostOptions) {
  const workflowsQuery = useQuery(workflowsQueryOptions());
  const workflows = useMemo(() => workflowsQuery.data?.workflows ?? [], [workflowsQuery.data]);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [editing, setEditing] = useState<{ name: string | null } | null>(null);

  if (useChanged(folder)) {
    setPendingRun(null);
    setEditing(null);
  }

  const onRunWorkflow = useCallback(
    (name: string) => {
      const paths = getJobPaths();
      // An emptied selection never widens to the whole folder.
      if (!folder || paths?.length === 0) return;
      // The scope is fixed now, as for any job: later selection changes do not reach the run.
      setPendingRun({
        name,
        scope: { ...liveScope, itemCount: paths?.length ?? liveScope.itemCount },
        paths: paths ? [...paths] : undefined,
      });
    },
    [folder, getJobPaths, liveScope],
  );

  const onEditWorkflows = useCallback((name: string | null) => {
    setPendingRun(null);
    setEditing({ name });
  }, []);

  const runningHere =
    startingWorkflow && folder && foldersMatch(startingWorkflow.folder, folder)
      ? startingWorkflow.name
      : null;

  const actions = useMemo<WorkflowActions>(
    () => ({ workflows, startingWorkflow: runningHere, onRunWorkflow, onEditWorkflows }),
    [onEditWorkflows, onRunWorkflow, runningHere, workflows],
  );

  const runWorkflowNamed = pendingRun
    ? workflows.find((workflow) => workflow.name === pendingRun.name)
    : undefined;

  const overlays: WorkflowOverlaysState = {
    run:
      pendingRun && runWorkflowNamed && folder
        ? {
            workflow: runWorkflowNamed,
            scope: { ...pendingRun.scope, queuedAfter },
            busy: runningHere === pendingRun.name,
            onConfirm: () => {
              void runWorkflow(folder, pendingRun.name, pendingRun.paths).then((jobs) => {
                if (jobs) setPendingRun(null);
              });
            },
            onEdit: () => onEditWorkflows(pendingRun.name),
            onCancel: () => setPendingRun(null),
          }
        : null,
    editor:
      editing && folder
        ? {
            workflows,
            initialName: editing.name,
            stepDialogs: {
              folderPath: folder,
              folderLabel,
              itemCount: liveScope.itemCount,
              folderItemCount,
              scopeKind,
              getJobPaths,
              comfyPresetsAvailable,
            },
            onRun: (name) => {
              setEditing(null);
              onRunWorkflow(name);
            },
            onClose: () => setEditing(null),
          }
        : null,
  };

  return { actions, overlays };
}
