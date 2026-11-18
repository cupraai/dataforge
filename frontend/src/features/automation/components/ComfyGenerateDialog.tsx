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

export interface ComfyGenerateSettings extends ResolvedPresetValues {
  count: number;
  /** Empty names the files after the preset. */
  namePrefix: string;
  captionFromPrompt: boolean;
}

interface ComfyGenerateDialogProps {
  scope: DialogScopeInfo;
  initialSettings: JobSettingsByType["comfy_generate"];
  busy?: boolean;
  /** Runs this file's own workflow, once, instead of a preset. */
  embedded?: EmbeddedGenerateWorkflow;
  onConfirm: (settings: ComfyGenerateSettings) => void;
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

export function ComfyGenerateDialog({
  scope,
  initialSettings,
  busy = false,
  embedded,
  onConfirm,
  onCancel,
}: ComfyGenerateDialogProps) {
  const form = useComfyPresetForm(initialSettings, "generate", embedded);
  // Held as text so the field can be emptied mid-edit instead of snapping back.
  const [countText, setCountText] = useState(String(initialSettings.count));
  const [namePrefix, setNamePrefix] = useState(initialSettings.name_prefix);
  const [captionFromPrompt, setCaptionFromPrompt] = useState(initialSettings.caption_from_prompt);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const ready = form.state.status === "ready";
  const defaultPrefix = embedded ? embeddedNamePrefix(embedded) : form.preset;
  const shownPrefix = namePrefix.trim() || defaultPrefix || "generated";

  const handleConfirm = () => {
    if (busy || !ready) return;

    const resolved = form.resolve();
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }
    const count = parseCount(countText);
    if (count === null) {
      setError(`Generations must be a whole number from 1 to ${MAX_COMFY_GENERATE_COUNT}.`);
      return;
    }
    const prefix = namePrefix.trim();
    const badPrefix = prefixError(prefix);
    if (badPrefix) {
      setError(badPrefix);
      return;
    }

    setError(null);
    onConfirm({ ...resolved.values, count, namePrefix: prefix, captionFromPrompt });
  };

  const edited = () => setError(null);

  return (
    <GuardedDialog
      confirmDisabled={busy || !ready || !form.preset}
      unsavedChanges={
        form.changed ||
        countText !== String(initialSettings.count) ||
        namePrefix !== initialSettings.name_prefix ||
        captionFromPrompt !== initialSettings.caption_from_prompt
      }
      scope={scope}
      title="Generate with ComfyUI?"
      description={
        <>
          Adds each result as a new file, <strong>{shownPrefix}_0001</strong> onwards. Nothing is
          replaced.
        </>
      }
      panelClassName="comfy-generate-dialog"
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
            confirmLabel="Start generating"
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <ComfyPresetFields
        form={form}
        kind="generate"
        embedded={embedded}
        busy={busy}
        onEdited={edited}
        promptLabelEnd={
          <Checkbox
            className="comfy-generate-dialog__caption"
            label="Save as caption"
            checked={captionFromPrompt && !form.promptBlocked}
            disabled={busy || form.promptBlocked}
            onChange={(checked) => {
              setCaptionFromPrompt(checked);
              edited();
            }}
          />
        }
      >
        <div className="field-row comfy-generate-dialog__output">
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
      </ComfyPresetFields>
    </GuardedDialog>
  );
}
