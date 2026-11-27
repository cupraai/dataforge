import { Checkbox } from "@/shared/ui/Checkbox";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { previewAutoCaption } from "@/features/automation/api/jobs";
import { autoCaptionPlan } from "@/features/automation/lib/autoCaptionPlan";
import { AutomationModeSelector } from "@/features/automation/components/AutomationModeSelector";
import { InstructionFileSource } from "@/features/automation/components/InstructionFileSource";
import { ReasoningEffortSelector } from "@/features/automation/components/ReasoningEffortSelector";
import { useReasoningEffort } from "@/features/automation/hooks/useReasoningEffort";
import { VisionModelBadge } from "@/features/automation/components/VisionModelBadge";
import { ServiceStatus } from "@/features/automation/components/ServiceStatus";
import { useVisionLlmInfo } from "@/features/automation/hooks/useVisionLlmInfo";
import { useFolderInstructions } from "@/shared/hooks/useFolderInstructions";
import { instructionApplies } from "@/shared/api/folderInstructions";
import { DialogActions } from "@/shared/ui/Dialog";
import { Icon } from "@/shared/ui/Icon";
import { iconListChecks } from "@/shared/icons";
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
  const effort = useReasoningEffort(initialSettings.reasoning_effort);
  const [preserveThinking, setPreserveThinking] = useState(initialSettings.preserve_thinking);
  const { state, instructions } = useFolderInstructions(folderPath);
  const vision = useVisionLlmInfo();
  const promptReady = instructions !== null && instructionApplies(instructions.sysprompt);
  // What the run will do, before it starts: a fresh dataset is captioned from scratch.
  const plan = useQuery({
    queryKey: ["auto-caption-preview", folderPath, selectedPaths],
    queryFn: ({ signal }) => previewAutoCaption(folderPath, selectedPaths, signal),
    retry: false,
    gcTime: 0,
  });

  return (
    <GuardedDialog
      // A workflow step runs later, so only starting now needs the server and the prompt.
      confirmDisabled={!vision.ready || (!editingStep && (vision.unreachable || !promptReady))}
      unsavedChanges={
        mode !== initialSettings.mode ||
        captionAudio !== initialSettings.caption_audio ||
        effort.changed ||
        preserveThinking !== initialSettings.preserve_thinking
      }
      scope={scope}
      icon={jobTypeIconFor("auto_caption")}
      title="Start auto-caption?"
      description={
        <>
          Writes captions with <VisionModelBadge info={vision.info} loading={!vision.ready} />:
          short drafts are expanded, and files without a caption are captioned from the media alone.
        </>
      }
      panelClassName="auto-caption-dialog"
      busy={busy}
      onConfirm={() =>
        onConfirm({
          mode,
          caption_audio: captionAudio,
          reasoning_effort: effort.value,
          preserve_thinking: preserveThinking,
        })
      }
      onClose={onCancel}
      footer={
        <>
          <ServiceStatus
            service="vision"
            state={vision.service}
            address={vision.info?.baseUrl}
            issue={vision.issue}
          />
          <DialogActions
            confirmLabel={confirmLabel ?? "Start auto-caption"}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <div className="dialog-facts">
        {!editingStep && <InstructionFileSource state={state} kind="sysprompt" />}
        {plan.data && (
          <p className="dialog-facts__line" role="status">
            <Icon icon={iconListChecks} className="dialog-facts__icon" />
            <span>{autoCaptionPlan(plan.data)}</span>
          </p>
        )}
      </div>

      <AutomationModeSelector value={mode} disabled={busy} onChange={setMode} />

      <ReasoningEffortSelector
        value={effort.value}
        levels={effort.levels}
        loading={effort.loading}
        disabled={mode === "instruct" || busy}
        onChange={effort.onChange}
      />

      <Checkbox
        label="Preserve thinking"
        checked={preserveThinking}
        disabled={mode === "instruct" || busy}
        onChange={setPreserveThinking}
        hint="Keeps earlier reasoning in the prompt instead of dropping it."
      />

      <Checkbox
        label="Caption audio"
        checked={captionAudio}
        disabled={busy}
        onChange={setCaptionAudio}
        hint="Describes what is heard as well as what is seen. Needs a model with audio support."
      />

      {!editingStep && state.status === "error" && (
        <p className="dialog__error" role="alert">
          Could not load the system prompt. {state.message}
        </p>
      )}
      {!editingStep && instructions?.sysprompt.state.status === "missing" && (
        <p className="field__hint">
          No system prompt was found in this folder or above it. Add one in Folder instructions,
          starting with a # heading.
        </p>
      )}
    </GuardedDialog>
  );
}
