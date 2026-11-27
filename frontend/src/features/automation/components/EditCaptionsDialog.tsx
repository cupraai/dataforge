import { Button } from "@/shared/ui/Button";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { Field, TextArea } from "@/shared/ui/Field";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { previewCaptionEdits } from "@/features/automation/api/jobs";
import { CaptionPreviewPanel } from "@/features/automation/components/CaptionPreviewPanel";
import { CaptionBackupOption } from "@/features/automation/components/CaptionBackupOption";
import { SavedSnippetMenu } from "@/features/automation/components/SavedSnippetMenu";
import { SyspromptPlacementMenu } from "@/features/automation/components/SyspromptPlacementMenu";
import { appendSnippet } from "@/features/automation/lib/appendSnippet";
import { AutomationModeSelector } from "@/features/automation/components/AutomationModeSelector";
import { ReasoningEffortSelector } from "@/features/automation/components/ReasoningEffortSelector";
import { useReasoningEffort } from "@/features/automation/hooks/useReasoningEffort";
import { VisionModelBadge } from "@/features/automation/components/VisionModelBadge";
import { VisionJobFooter } from "@/features/automation/components/VisionJobFooter";
import { useVisionLlmInfo } from "@/features/automation/hooks/useVisionLlmInfo";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { formatApiError } from "@/shared/api/http";
import { CAPTION_EDIT_PREVIEW_LIMIT } from "@/shared/constants";
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
  /** Saves a workflow step, which runs later, so the server need not answer now. */
  editingStep?: boolean;
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
  editingStep = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: EditCaptionsDialogProps) {
  const [mode, setMode] = useState(initialSettings.mode);
  const [instruction, setInstruction] = useState(initialSettings.instruction);
  const effort = useReasoningEffort(initialSettings.reasoning_effort);
  const [preserveThinking, setPreserveThinking] = useState(initialSettings.preserve_thinking);
  const [vision, setVision] = useState(initialSettings.vision);
  const [syspromptPlacement, setSyspromptPlacement] = useState(initialSettings.sysprompt_placement);
  // Reset on every open so opting out only applies to the current run.
  const [backup, setBackup] = useState(initialSettings.backup ?? true);
  const [error, setError] = useState<string | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const server = useVisionLlmInfo();

  const settings = {
    instruction: instruction.trim(),
    mode,
    reasoning_effort: effort.value,
    preserve_thinking: preserveThinking,
    vision,
    sysprompt_placement: syspromptPlacement,
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

  // Stacked on a narrow window, the results land below the form and may be out of view.
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

  /** False, with the error shown, when there is no instruction to run. */
  const checkInstruction = () => {
    if (controlsBusy) return false;
    if (!settings.instruction) {
      setError("Enter an instruction for the edit.");
      instructionRef.current?.focus();
      return false;
    }
    setError(null);
    return true;
  };

  const handlePreview = () => {
    if (checkInstruction()) void preview.refetch();
  };

  const handleConfirm = () => {
    if (checkInstruction()) onConfirm({ ...settings, backup });
  };

  return (
    <GuardedDialog
      // A workflow step runs later, so only starting now needs the server to answer.
      confirmDisabled={!server.ready || (!editingStep && server.unreachable) || preview.isFetching}
      unsavedChanges={
        mode !== initialSettings.mode ||
        instruction !== initialSettings.instruction ||
        effort.changed ||
        preserveThinking !== initialSettings.preserve_thinking ||
        vision !== initialSettings.vision ||
        syspromptPlacement !== initialSettings.sysprompt_placement ||
        !backup
      }
      scope={scope}
      icon={jobTypeIconFor("edit_captions")}
      title="Start edit captions?"
      description={
        <>
          Rewrites each caption with <VisionModelBadge info={server.info} loading={!server.ready} />{" "}
          from your instruction.{" "}
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
        <VisionJobFooter
          vision={server}
          confirmLabel={confirmLabel ?? "Start edit captions"}
          onCancel={onCancel}
        />
      }
    >
      <div className="edit-captions-dialog__body dialog-preview-split">
        <div className="dialog-preview-split__form">
          <AutomationModeSelector value={mode} disabled={controlsBusy} onChange={setMode} />

          <ReasoningEffortSelector effort={effort} disabled={mode === "instruct" || controlsBusy} />

          <div className="field edit-captions-dialog__toggles">
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

          <CaptionBackupOption checked={backup} disabled={controlsBusy} onChange={setBackup} />

          <Field
            label="Instruction"
            labelEnd={
              <>
                <SyspromptPlacementMenu
                  value={syspromptPlacement}
                  folderPath={folderPath}
                  editingStep={editingStep}
                  disabled={controlsBusy}
                  onChange={setSyspromptPlacement}
                />
                <SavedSnippetMenu
                  book="instructions"
                  text={instruction}
                  disabled={controlsBusy}
                  onInsert={(text) => {
                    setInstruction((current) => appendSnippet(current, text));
                    setError(null);
                    instructionRef.current?.focus();
                  }}
                />
              </>
            }
          >
            {(control) => (
              <TextArea
                {...control}
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
            )}
          </Field>

          {error && (
            <p id={errorId} className="dialog__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <CaptionPreviewPanel
          ref={previewRef}
          summary={previewSummary}
          labelEnd={
            <Button
              size="xs"
              busy={preview.isFetching}
              disabled={busy || !server.ready || server.unreachable}
              onClick={handlePreview}
              // Enter runs the preview here, not the dialog's start.
              onKeyDown={(event) => {
                if (event.key === "Enter") event.stopPropagation();
              }}
            >
              {preview.isFetching ? "Running..." : "Dry run"}
            </Button>
          }
          samples={preview.isFetching ? [] : preview.data?.samples}
          pending={preview.isFetching}
          error={preview.isError}
        />
      </div>
    </GuardedDialog>
  );
}
