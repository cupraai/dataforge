import { useId, useState } from "react";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { MAX_TRIM_LENGTH_SECONDS, MIN_TRIM_LENGTH_SECONDS } from "@/shared/constants";
import type { TrimVideoKeep, TrimVideoRunSettings } from "@/shared/types";
import { Checkbox } from "@/shared/ui/Checkbox";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { Field, TextInput } from "@/shared/ui/Field";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { RadioTileGroup, type RadioTileOption } from "@/shared/ui/RadioTileGroup";

const KEEP_OPTIONS: ReadonlyArray<RadioTileOption<TrimVideoKeep>> = [
  { value: "start", title: "Start", description: "Cuts the end." },
  { value: "middle", title: "Middle", description: "Cuts both ends evenly." },
  { value: "end", title: "End", description: "Cuts the beginning." },
];

interface TrimVideoDialogProps {
  scope: DialogScopeInfo;
  /** A workflow step's settings also carry the start-only choices, which then win. */
  initialSettings: JobSettingsByType["trim_video"] &
    Partial<Pick<TrimVideoRunSettings, "reset_trim">>;
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: TrimVideoRunSettings) => void;
  onCancel: () => void;
}

function parseSeconds(value: string): number | null {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return trimmed &&
    Number.isFinite(parsed) &&
    parsed >= MIN_TRIM_LENGTH_SECONDS &&
    parsed <= MAX_TRIM_LENGTH_SECONDS
    ? parsed
    : null;
}

export function TrimVideoDialog({
  scope,
  initialSettings,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: TrimVideoDialogProps) {
  const [keep, setKeep] = useState<TrimVideoKeep>(initialSettings.keep);
  // Held as text so the field can be emptied mid-edit instead of snapping back.
  const [length, setLength] = useState(String(initialSettings.max_seconds));
  // Never restored: discarding earlier trims is destructive, so it is re-chosen every run.
  const [reset, setReset] = useState(initialSettings.reset_trim ?? false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const errorId = useId();

  const handleConfirm = () => {
    if (busy) return;

    // The fields are ignored on a reset, so the remembered settings travel unchanged.
    if (reset) {
      setError(null);
      onConfirm({
        max_seconds: initialSettings.max_seconds,
        keep: initialSettings.keep,
        reset_trim: true,
      });
      return;
    }
    const parsed = parseSeconds(length);
    if (parsed === null) {
      setError(
        `The longest length must be from ${MIN_TRIM_LENGTH_SECONDS} to ${MAX_TRIM_LENGTH_SECONDS} seconds.`,
      );
      return;
    }

    setError(null);
    onConfirm({ max_seconds: parsed, keep, reset_trim: false });
  };

  return (
    <GuardedDialog
      unsavedChanges={
        keep !== initialSettings.keep || length !== String(initialSettings.max_seconds) || reset
      }
      scope={scope}
      title={reset ? "Clear trims?" : "Trim videos?"}
      description={
        reset ? (
          <>Clears the trim of each video so it plays in full. All other edits are kept.</>
        ) : (
          <>
            Shortens each video that plays longer than this, within any trim it already has. Shorter
            videos are left alone. Each original is stored so the editor can revert it.
          </>
        )
      }
      panelClassName="trim-video-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      describedById={error ? errorId : undefined}
      footer={
        <DialogActions
          confirmLabel={confirmLabel ?? (reset ? "Clear trims" : "Trim videos")}
          busyLabel="Starting..."
          onCancel={onCancel}
        />
      }
    >
      <RadioTileGroup
        value={keep}
        options={KEEP_OPTIONS}
        label="Keep"
        disabled={busy || reset}
        onChange={setKeep}
      />

      <div className="field">
        <Field label="Longest length (s)">
          {(control) => (
            <TextInput
              {...control}
              aria-describedby={hintId}
              type="number"
              className="trim-video-dialog__number"
              value={length}
              min={MIN_TRIM_LENGTH_SECONDS}
              max={MAX_TRIM_LENGTH_SECONDS}
              step={0.5}
              onChange={(event) => {
                setLength(event.target.value);
                setError(null);
              }}
              autoComplete="off"
              disabled={busy || reset}
            />
          )}
        </Field>
        <p id={hintId} className="field__hint">
          The length as played, so a sped-up video keeps more of its footage.
        </p>
        {error && (
          <p id={errorId} className="dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <Checkbox
        label="Clear the trim"
        checked={reset}
        disabled={busy}
        onChange={(checked) => {
          setReset(checked);
          setError(null);
        }}
        hint="Restores each video's full length instead of shortening it. Crops, speed and all other edits are kept."
      />
    </GuardedDialog>
  );
}
