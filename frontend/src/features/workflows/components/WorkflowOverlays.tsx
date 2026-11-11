import type { WorkflowOverlaysState } from "@/features/workflows/hooks/useWorkflowHost";
import { WorkflowEditorDialog } from "./WorkflowEditorDialog";
import { WorkflowRunDialog } from "./WorkflowRunDialog";

export function WorkflowOverlays({ state }: { state: WorkflowOverlaysState }) {
  const { run, editor } = state;
  return (
    <>
      {run && (
        <WorkflowRunDialog
          workflow={run.workflow}
          scope={run.scope}
          busy={run.busy}
          onEdit={run.onEdit}
          onConfirm={run.onConfirm}
          onCancel={run.onCancel}
        />
      )}
      {editor && (
        <WorkflowEditorDialog
          // A fresh editor per opening, so it starts from the workflow it was opened on.
          key={editor.initialName ?? "\u0000new"}
          workflows={editor.workflows}
          initialName={editor.initialName}
          stepDialogs={editor.stepDialogs}
          onRun={editor.onRun}
          onClose={editor.onClose}
        />
      )}
    </>
  );
}
