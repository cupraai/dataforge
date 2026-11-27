import { Field, TextArea } from "@/shared/ui/Field";
import { jobTypeIconFor } from "@/features/jobs/lib/jobMeta";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useRef, useState } from "react";
import { AutomationModeSelector } from "@/features/automation/components/AutomationModeSelector";
import { ReasoningEffortSelector } from "@/features/automation/components/ReasoningEffortSelector";
import { useReasoningEffort } from "@/features/automation/hooks/useReasoningEffort";
import { SavedSnippetMenu } from "@/features/automation/components/SavedSnippetMenu";
import { SyspromptPlacementMenu } from "@/features/automation/components/SyspromptPlacementMenu";
import { VisionModelBadge } from "@/features/automation/components/VisionModelBadge";
import { VisionJobFooter } from "@/features/automation/components/VisionJobFooter";
import { useVisionLlmInfo } from "@/features/automation/hooks/useVisionLlmInfo";
import { appendSnippet } from "@/features/automation/lib/appendSnippet";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";

type Settings = JobSettingsByType["verify_captions"];

interface VerifyCaptionsDialogProps {
  scope: DialogScopeInfo;
  initialSettings: Settings;
  folderPath: string;
  busy?: boolean;
  /** Saves a workflow step, which runs later, so the server need not answer now. */
  editingStep?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: Settings) => void;
  onCancel: () => void;
}

export function VerifyCaptionsDialog({
  scope,
  initialSettings,
  folderPath,
  busy = false,
  editingStep = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: VerifyCaptionsDialogProps) {
  const [mode, setMode] = useState(initialSettings.mode);
  const [instruction, setInstruction] = useState(initialSettings.instruction);
  const effort = useReasoningEffort(initialSettings.reasoning_effort);
  const [preserveThinking, setPreserveThinking] = useState(initialSettings.preserve_thinking);
  const [syspromptPlacement, setSyspromptPlacement] = useState(initialSettings.sysprompt_placement);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const vision = useVisionLlmInfo();

  return (
    <GuardedDialog
      unsavedChanges={
        mode !== initialSettings.mode ||
        instruction !== initialSettings.instruction ||
        effort.changed ||
        preserveThinking !== initialSettings.preserve_thinking ||
        syspromptPlacement !== initialSettings.sysprompt_placement
      }
      scope={scope}
      icon={jobTypeIconFor("verify_captions")}
      title="Start verify captions?"
      description={
        <>
          Verifies the captions using{" "}
          <VisionModelBadge info={vision.info} loading={!vision.ready} />. Media with caption issues
          will be marked with an exclamation mark.
        </>
      }
      // A workflow step runs later, so only starting now needs the server to answer.
      confirmDisabled={!vision.ready || (!editingStep && vision.unreachable)}
      panelClassName="verify-captions-dialog"
      busy={busy}
      onConfirm={() =>
        onConfirm({
          mode,
          instruction,
          reasoning_effort: effort.value,
          preserve_thinking: preserveThinking,
          sysprompt_placement: syspromptPlacement,
        })
      }
      onClose={onCancel}
      footer={
        <VisionJobFooter
          vision={vision}
          confirmLabel={confirmLabel ?? "Start verify captions"}
          onCancel={onCancel}
        />
      }
    >
      <AutomationModeSelector value={mode} disabled={busy} onChange={setMode} />

      <ReasoningEffortSelector effort={effort} disabled={mode === "instruct" || busy} />

      <Checkbox
        label="Preserve thinking"
        checked={preserveThinking}
        disabled={mode === "instruct" || busy}
        onChange={setPreserveThinking}
        hint="Keeps earlier reasoning in the prompt instead of dropping it."
      />

      <Field
        label="Instruction"
        labelEnd={
          <>
            <SyspromptPlacementMenu
              value={syspromptPlacement}
              folderPath={folderPath}
              editingStep={editingStep}
              disabled={busy}
              onChange={setSyspromptPlacement}
            />
            <SavedSnippetMenu
              book="verify_instructions"
              text={instruction}
              disabled={busy}
              onInsert={(text) => {
                setInstruction((current) => appendSnippet(current, text));
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
            className="verify-captions-dialog__instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="e.g. typical poses or recurring subjects"
            rows={2}
            disabled={busy}
            data-scroll-lock-allow
          />
        )}
      </Field>
    </GuardedDialog>
  );
}
