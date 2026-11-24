import { Field, TextArea } from "@/shared/ui/Field";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useRef, useState } from "react";
import { AutomationModeSelector } from "@/features/automation/components/AutomationModeSelector";
import { ReasoningEffortSelector } from "@/features/automation/components/ReasoningEffortSelector";
import { useReasoningEffort } from "@/features/automation/hooks/useReasoningEffort";
import { SavedSnippetMenu } from "@/features/automation/components/SavedSnippetMenu";
import { VisionModelBadge } from "@/features/automation/components/VisionModelBadge";
import { ServiceStatus } from "@/features/automation/components/ServiceStatus";
import { useVisionLlmInfo } from "@/features/automation/hooks/useVisionLlmInfo";
import { appendSnippet } from "@/features/automation/lib/appendSnippet";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";

type Settings = JobSettingsByType["verify_captions"];

interface VerifyCaptionsDialogProps {
  scope: DialogScopeInfo;
  initialSettings: Settings;
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
  busy = false,
  editingStep = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: VerifyCaptionsDialogProps) {
  const [mode, setMode] = useState(initialSettings.mode);
  const [context, setContext] = useState(initialSettings.context);
  const effort = useReasoningEffort(initialSettings.reasoning_effort);
  const [preserveThinking, setPreserveThinking] = useState(initialSettings.preserve_thinking);
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const vision = useVisionLlmInfo();

  return (
    <GuardedDialog
      unsavedChanges={
        mode !== initialSettings.mode ||
        context !== initialSettings.context ||
        effort.changed ||
        preserveThinking !== initialSettings.preserve_thinking
      }
      scope={scope}
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
          context,
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
            confirmLabel={confirmLabel ?? "Start verify captions"}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
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

      <Field
        label="Additional context"
        labelEnd={
          <SavedSnippetMenu
            book="verify_contexts"
            text={context}
            disabled={busy}
            onInsert={(text) => {
              setContext((current) => appendSnippet(current, text));
              contextRef.current?.focus();
            }}
          />
        }
      >
        {(control) => (
          <TextArea
            {...control}
            ref={contextRef}
            grow
            className="verify-captions-dialog__context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
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
