import { Button } from "@/shared/ui/Button";
import { TextArea } from "@/shared/ui/Field";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { previewCaptionEdits } from "@/features/automation/api/jobs";
import { CaptionPreviewPanel } from "@/features/automation/components/CaptionPreviewPanel";
import { CaptionBackupOption } from "@/features/automation/components/CaptionBackupOption";
import { InstructionSnippetMenu } from "@/features/automation/components/InstructionSnippetMenu";
import { appendInstruction } from "@/features/automation/lib/appendInstruction";
import { AutomationModeSelector } from "@/features/automation/components/AutomationModeSelector";
import { ReasoningEffortSelector } from "@/features/automation/components/ReasoningEffortSelector";
import { VisionModelBadge } from "@/features/automation/components/VisionModelBadge";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { formatApiError } from "@/shared/api/http";
import { CAPTION_EDIT_PREVIEW_LIMIT } from "@/shared/constants";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import type { EditCaptionsRunSettings } from "@/shared/types";

interface EditCaptionsDialogProps {
  scope: DialogScopeInfo;
  /** A workflow step's settings also carry the start-only choices, which then win. */
  initialSettings: JobSettingsByType["edit_captions"] &
    Partial<Pick<EditCaptionsRunSettings, "backup">>;
  folderPath: string;
  selectedPaths?: string[];
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: EditCaptionsRunSettings) => void;
  onCancel: () => void;
}

export function EditCaptionsDialog({
  scope,
  initialSettings,
  folderPath,
  selectedPaths,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: EditCaptionsDialogProps) {
  const [mode, setMode] = useState(initialSettings.mode);
  const [instruction, setInstruction] = useState(initialSettings.instruction);
  const [reasoningEffort, setReasoningEffort] = useState(initialSettings.reasoning_effort);
  const [preserveThinking, setPreserveThinking] = useState(initialSettings.preserve_thinking);
  const [vision, setVision] = useState(initialSettings.vision);
  // Reset on every open so opting out only applies to the current run.
  const [backup, setBackup] = useState(initialSettings.backup ?? true);
  const [error, setError] = useState<string | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const instructionId = useId();
  const errorId = useId();

  const settings = {
    instruction: instruction.trim(),
    mode,
    reasoning_effort: reasoningEffort,
    preserve_thinking: preserveThinking,
    vision,
  };
  const request = { ...settings, paths: selectedPaths };
  const preview = useQuery({
    queryKey: ["edit-captions-preview", folderPath, request],
    queryFn: ({ signal }) => previewCaptionEdits(folderPath, request, signal),
    enabled: false,
    retry: false,
    gcTime: 0,
  });
  const controlsBusy = busy || preview.isFetching;

  // The results land below the form, which may be scrolled out of view on a short window.
  const previewRef = useRef<HTMLDivElement>(null);
  const previewShown = preview.isFetching || preview.isError || preview.data !== undefined;
  const previewResult = preview.data ?? preview.error;
  useEffect(() => {
    if (previewShown) previewRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [previewResult, previewShown]);

  let previewSummary: ReactNode;
  if (preview.isFetching) {
    previewSummary = "Generating sample edits...";
  } else if (preview.isError) {
    previewSummary = formatApiError(preview.error);
  } else if (!preview.data) {
    previewSummary =
      `Dry run rewrites up to ${CAPTION_EDIT_PREVIEW_LIMIT} readable captions in filename ` +
      "order without saving them. The full job generates fresh results.";
  } else if (preview.data.samples.length === 0) {
    previewSummary = "No readable captions found in this scope.";
  } else {
    previewSummary = (
      <>
        <strong>{preview.data.samples.length}</strong> sample{" "}
        {preview.data.samples.length === 1 ? "edit" : "edits"}; nothing was saved. The full job
        generates fresh results.
      </>
    );
  }

  const handlePreview = () => {
    if (controlsBusy) return;
    if (!instruction.trim()) {
      setError("Enter an instruction for the edit.");
      instructionRef.current?.focus();
      return;
    }
    setError(null);
    void preview.refetch();
  };

  const handleConfirm = () => {
    if (controlsBusy) return;

    if (!settings.instruction) {
      setError("Enter an instruction for the edit.");
      instructionRef.current?.focus();
      return;
    }

    setError(null);
    onConfirm({ ...settings, backup });
  };

  return (
    <GuardedDialog
      confirmDisabled={preview.isFetching}
      unsavedChanges={
        mode !== initialSettings.mode ||
        instruction !== initialSettings.instruction ||
        reasoningEffort !== initialSettings.reasoning_effort ||
        preserveThinking !== initialSettings.preserve_thinking ||
        vision !== initialSettings.vision ||
        !backup
      }
      scope={scope}
      title="Start edit captions?"
      description={
        <>
          Rewrites each caption with <VisionModelBadge /> from your instruction.{" "}
          {vision
            ? "Each caption is sent with its image or video keyframes."
            : "Only the caption text is sent, never the media."}
        </>
      }
      panelClassName="edit-captions-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      initialFocusRef={instructionRef}
      describedById={error ? errorId : undefined}
      footer={
        <>
          <div className="edit-captions-dialog__dry-run-action">
            <Button
              busy={preview.isFetching}
              disabled={busy}
              onClick={handlePreview}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.stopPropagation();
              }}
            >
              {preview.isFetching ? "Running..." : "Dry run"}
            </Button>
          </div>
          <DialogActions
            confirmLabel={confirmLabel ?? "Start edit captions"}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <div className="edit-captions-dialog__body">
        <AutomationModeSelector
          value={mode}
          name="edit-captions-mode"
          groupLabel="Edit mode"
          disabled={controlsBusy}
          onChange={setMode}
        />

        <ReasoningEffortSelector
          value={reasoningEffort}
          name="edit-captions-reasoning-effort"
          groupLabel="Edit reasoning effort"
          disabled={mode === "instruct" || controlsBusy}
          onChange={setReasoningEffort}
        />

        <div className="dialog__field edit-captions-dialog__toggles">
          <Checkbox
            label="Preserve thinking"
            checked={preserveThinking}
            disabled={mode === "instruct" || controlsBusy}
            onChange={setPreserveThinking}
            hint="Keeps earlier reasoning in the prompt."
          />

          <Checkbox
            label="Send media"
            checked={vision}
            disabled={controlsBusy}
            onChange={setVision}
            hint="Edits can check what the media shows."
          />
        </div>

        <div className="dialog__field">
          <CaptionBackupOption checked={backup} disabled={controlsBusy} onChange={setBackup} />
        </div>

        <div className="dialog__field">
          <div className="edit-captions-dialog__instruction-header">
            <label htmlFor={instructionId} className="dialog__label">
              Edit instruction
            </label>
            <InstructionSnippetMenu
              instruction={instruction}
              disabled={controlsBusy}
              onInsert={(text) => {
                setInstruction((current) => appendInstruction(current, text));
                setError(null);
                instructionRef.current?.focus();
              }}
            />
          </div>
          <TextArea
            id={instructionId}
            ref={instructionRef}
            grow
            className="edit-captions-dialog__instruction"
            value={instruction}
            onChange={(event) => {
              setInstruction(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Rewrite each caption in present tense"
            rows={2}
            disabled={controlsBusy}
            data-scroll-lock-allow
          />
        </div>

        <CaptionPreviewPanel
          ref={previewRef}
          summary={previewSummary}
          samples={preview.isFetching ? [] : preview.data?.samples}
          pending={preview.isFetching}
          error={preview.isError}
        />

        {error && (
          <p id={errorId} className="dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </GuardedDialog>
  );
}
