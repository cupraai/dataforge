import { useId, useState } from "react";
import { embeddedNamePrefix } from "@/features/automation/lib/embeddedGenerate";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import {
  useComfyPresetForm,
  type ResolvedPresetValues,
} from "@/features/automation/hooks/useComfyPresetForm";
import { MAX_COMFY_GENERATE_COUNT, MAX_COMFY_GENERATE_PREFIX_LENGTH } from "@/shared/constants";
import { Checkbox } from "@/shared/ui/Checkbox";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { Field, TextInput } from "@/shared/ui/Field";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { ComfyPresetFields } from "./ComfyPresetFields";

export interface ComfyRunSettings extends ResolvedPresetValues {
  /** The selected preset makes new files, so the job ignores the scope. */
  generates: boolean;
  overwriteCandidates: boolean;
  count: number;
  /** Empty names the files after the preset. */
  namePrefix: string;
  captionFromPrompt: boolean;
}

interface ComfyRunDialogProps {
  /** The files an editing preset runs on. */
  scope: DialogScopeInfo;
  /** Where a generating preset's new files go. */
  destinationScope: DialogScopeInfo;
  initialSettings: JobSettingsByType["comfy_run"];
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  /** Lists only presets that edit files: a workflow step runs on files chosen beforehand. */
  editOnly?: boolean;
  /** Runs this file's own workflow, once, instead of a preset. */
  embedded?: EmbeddedGenerateWorkflow;
  onConfirm: (settings: ComfyRunSettings) => void;
  onCancel: () => void;
}

/** Characters Windows refuses in a file name, besides control characters; the backend refuses
 * the same set. */
const UNSAFE_NAME = /[<>:"/\\|?*]/;

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 0x20) return true;
  }
  return false;
}

function prefixError(prefix: string): string | null {
  if (prefix.length > MAX_COMFY_GENERATE_PREFIX_LENGTH) {
    return `The file name prefix can be at most ${MAX_COMFY_GENERATE_PREFIX_LENGTH} characters.`;
  }
  if (
    UNSAFE_NAME.test(prefix) ||
    hasControlCharacter(prefix) ||
    prefix.startsWith(".") ||
    /[. ]$/.test(prefix)
  ) {
    return 'The file name prefix cannot contain < > : " / \\ | ? *, start with a dot, or end with a dot or space.';
  }
  return null;
}

function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return count >= 1 && count <= MAX_COMFY_GENERATE_COUNT ? count : null;
}

export function ComfyRunDialog({
  scope,
  destinationScope,
  initialSettings,
  busy = false,
  confirmLabel,
  editOnly = false,
  embedded,
  onConfirm,
  onCancel,
}: ComfyRunDialogProps) {
  const form = useComfyPresetForm(initialSettings, editOnly ? "edit" : "run", embedded);
  const generates = form.mode === "generate";
  const [overwrite, setOverwrite] = useState(initialSettings.overwrite_candidates);
  // Held as text so the field can be emptied mid-edit instead of snapping back.
  const [countText, setCountText] = useState(String(initialSettings.count));
  const [namePrefix, setNamePrefix] = useState(initialSettings.name_prefix);
  const [captionFromPrompt, setCaptionFromPrompt] = useState(initialSettings.caption_from_prompt);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const ready = form.state.status === "ready";
  const defaultPrefix = embedded ? embeddedNamePrefix(embedded) : form.preset;
  const shownPrefix = namePrefix.trim() || defaultPrefix || "generated";
  // A step's scope is fixed when the workflow runs, not now.
  const nothingToEdit = !generates && !editOnly && scope.itemCount === 0;

  const handleConfirm = () => {
    if (busy || !ready || nothingToEdit) return;

    const resolved = form.resolve();
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }
    // Only a generation reads these, so a stale value never blocks an edit.
    const count = generates ? parseCount(countText) : initialSettings.count;
    if (count === null) {
      setError(`Generations must be a whole number from 1 to ${MAX_COMFY_GENERATE_COUNT}.`);
      return;
    }
    const prefix = namePrefix.trim();
    const badPrefix = generates ? prefixError(prefix) : null;
    if (badPrefix) {
      setError(badPrefix);
      return;
    }

    setError(null);
    onConfirm({
      ...resolved.values,
      generates,
      overwriteCandidates: overwrite,
      count,
      namePrefix: generates ? prefix : initialSettings.name_prefix,
      captionFromPrompt,
    });
  };

  const edited = () => setError(null);

  return (
    <GuardedDialog
      confirmDisabled={busy || !ready || !form.preset || nothingToEdit}
      unsavedChanges={
        form.changed ||
        overwrite !== initialSettings.overwrite_candidates ||
        countText !== String(initialSettings.count) ||
        namePrefix !== initialSettings.name_prefix ||
        captionFromPrompt !== initialSettings.caption_from_prompt
      }
      scope={generates ? destinationScope : scope}
      title="Run a ComfyUI workflow?"
      description={
        generates ? (
          <>
            Adds each result as a new file, <strong>{shownPrefix}_0001</strong> onwards. Nothing is
            replaced.
          </>
        ) : (
          <>
            Runs each file through the workflow and writes the result as a{" "}
            <strong>candidate</strong> in the <strong>staging</strong> subfolder, for you to accept
            or reject.
          </>
        )
      }
      panelClassName="comfy-run-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      describedById={error ? errorId : undefined}
      footer={
        <>
          {/* In the footer, so a message never shifts the columns. */}
          {error && (
            <p id={errorId} className="dialog__error comfy-preset-layout__error" role="alert">
              {error}
            </p>
          )}
          <DialogActions
            confirmLabel={confirmLabel ?? (generates ? "Start generating" : "Start processing")}
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <ComfyPresetFields
        form={form}
        embedded={embedded}
        busy={busy}
        onEdited={edited}
        promptLabelEnd={
          generates && (
            <Checkbox
              className="comfy-run-dialog__caption"
              label="Save as caption"
              checked={captionFromPrompt && !form.promptBlocked}
              disabled={busy || form.promptBlocked}
              onChange={(checked) => {
                setCaptionFromPrompt(checked);
                edited();
              }}
            />
          )
        }
      >
        {generates ? (
          <div className="field-row comfy-run-dialog__output">
            <Field label="Generations">
              {(control) => (
                <TextInput
                  {...control}
                  type="number"
                  min={1}
                  max={MAX_COMFY_GENERATE_COUNT}
                  step={1}
                  value={countText}
                  onChange={(event) => {
                    setCountText(event.target.value);
                    edited();
                  }}
                  autoComplete="off"
                  disabled={busy}
                />
              )}
            </Field>
            <Field label="File name prefix">
              {(control) => (
                <TextInput
                  {...control}
                  value={namePrefix}
                  maxLength={MAX_COMFY_GENERATE_PREFIX_LENGTH}
                  onChange={(event) => {
                    setNamePrefix(event.target.value);
                    edited();
                  }}
                  placeholder={defaultPrefix || "Preset name"}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy}
                />
              )}
            </Field>
          </div>
        ) : (
          <Checkbox
            label={
              <>
                Replace candidates already waiting in <strong>staging</strong>
              </>
            }
            checked={overwrite}
            disabled={busy}
            onChange={(checked) => {
              setOverwrite(checked);
              edited();
            }}
          />
        )}
      </ComfyPresetFields>
    </GuardedDialog>
  );
}
