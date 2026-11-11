import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { previewAutoCaption } from "@/features/automation/api/jobs";
import { autoCaptionPlan } from "@/features/automation/lib/autoCaptionPlan";
import { AutomationModeSelector } from "@/features/automation/components/AutomationModeSelector";
import { InstructionFileSource } from "@/features/automation/components/InstructionFileSource";
import { ReasoningEffortSelector } from "@/features/automation/components/ReasoningEffortSelector";
import { VisionModelBadge } from "@/features/automation/components/VisionModelBadge";
import { useFolderInstructions } from "@/shared/hooks/useFolderInstructions";
import { instructionApplies } from "@/shared/api/folderInstructions";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";

type Settings = JobSettingsByType["auto_caption"];

interface AutoCaptionDialogProps {
  scope: DialogScopeInfo;
  folderPath: string;
  /** The scope's files; undefined for the whole folder. */
  selectedPaths?: string[];
  initialSettings: Settings;
  busy?: boolean;
  editingStep?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: Settings) => void;
  onCancel: () => void;
}

export function AutoCaptionDialog({
  scope,
  folderPath,
  selectedPaths,
  initialSettings,
  busy = false,
  editingStep = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: AutoCaptionDialogProps) {
  const [mode, setMode] = useState(initialSettings.mode);
  const [captionAudio, setCaptionAudio] = useState(initialSettings.caption_audio);
  const [reasoningEffort, setReasoningEffort] = useState(initialSettings.reasoning_effort);
  const [preserveThinking, setPreserveThinking] = useState(initialSettings.preserve_thinking);
  const { state, instructions } = useFolderInstructions(folderPath);
  const promptReady = instructions !== null && instructionApplies(instructions.sysprompt);
  // What the run will do, before it starts: a fresh dataset is captioned from scratch.
  const plan = useQuery({
    queryKey: ["auto-caption-preview", folderPath, selectedPaths],
    queryFn: ({ signal }) => previewAutoCaption(folderPath, selectedPaths, signal),
    retry: false,
    gcTime: 0,
  });
  const captionAudioId = useId();
  const preserveThinkingId = useId();

  return (
    <GuardedDialog
      confirmDisabled={!editingStep && !promptReady}
      unsavedChanges={
        mode !== initialSettings.mode ||
        captionAudio !== initialSettings.caption_audio ||
        reasoningEffort !== initialSettings.reasoning_effort ||
        preserveThinking !== initialSettings.preserve_thinking
      }
      scope={scope}
      title="Start auto-caption?"
      description={
        <>
          Writes captions with <VisionModelBadge />: short drafts are expanded, and files without a
          caption are captioned from the media alone.
        </>
      }
      panelClassName="auto-caption-dialog"
      busy={busy}
      onConfirm={() =>
        onConfirm({
          mode,
          caption_audio: captionAudio,
          reasoning_effort: reasoningEffort,
          preserve_thinking: preserveThinking,
        })
      }
      onClose={onCancel}
      footer={
        <>
          {!editingStep && <InstructionFileSource state={state} kind="sysprompt" />}
          <DialogActions
            confirmLabel={confirmLabel ?? "Start auto-caption"}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      {plan.data && (
        <p className="dialog__hint" role="status">
          {autoCaptionPlan(plan.data)}
        </p>
      )}

      <AutomationModeSelector
        value={mode}
        name="auto-caption-mode"
        groupLabel="Caption mode"
        disabled={busy}
        onChange={setMode}
      />

      <ReasoningEffortSelector
        value={reasoningEffort}
        name="auto-caption-reasoning-effort"
        groupLabel="Caption reasoning effort"
        disabled={mode === "instruct" || busy}
        onChange={setReasoningEffort}
      />

      <div className="dialog__field">
        <label className="dialog__checkbox" htmlFor={preserveThinkingId}>
          <input
            id={preserveThinkingId}
            type="checkbox"
            className="dialog__checkbox-input"
            checked={preserveThinking}
            onChange={(event) => setPreserveThinking(event.target.checked)}
            disabled={mode === "instruct" || busy}
          />
          <span className="dialog__checkbox-box" aria-hidden="true" />
          <span className="dialog__checkbox-label">Preserve thinking</span>
        </label>
        <p className="dialog__hint">
          Keeps earlier reasoning in the prompt instead of dropping it.
        </p>
      </div>

      <div className="dialog__field">
        <label className="dialog__checkbox" htmlFor={captionAudioId}>
          <input
            id={captionAudioId}
            type="checkbox"
            className="dialog__checkbox-input"
            checked={captionAudio}
            onChange={(event) => setCaptionAudio(event.target.checked)}
            disabled={busy}
          />
          <span className="dialog__checkbox-box" aria-hidden="true" />
          <span className="dialog__checkbox-label">Caption audio</span>
        </label>
        <p className="dialog__hint">
          Describes what is heard as well as what is seen. Needs a model with audio support.
        </p>
      </div>

      {!editingStep && state.status === "error" && (
        <p className="dialog__error" role="alert">
          Could not load the system prompt. {state.message}
        </p>
      )}
      {!editingStep && instructions?.sysprompt.state.status === "missing" && (
        <p className="dialog__hint">
          No system prompt was found in this folder or above it. Add one in Folder instructions,
          starting with a # heading.
        </p>
      )}
    </GuardedDialog>
  );
}
