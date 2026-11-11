import { useId, useState } from "react";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { CLIPS_DIR_NAME, MAX_SPLIT_CLIP_SECONDS, MIN_SPLIT_CLIP_SECONDS } from "@/shared/constants";
import {
  frameRateChoice,
  frameRateFromChoice,
  frameRateOptions,
  type FrameRateChoice,
} from "@/shared/lib/frameRate";
import type { SceneSensitivity, SplitVideoMode } from "@/shared/types";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { DialogSelect } from "@/shared/ui/DialogSelect";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { RadioTileGroup, type RadioTileOption } from "@/shared/ui/RadioTileGroup";

type SplitVideoSettings = JobSettingsByType["split_video"];

const MODE_OPTIONS: ReadonlyArray<RadioTileOption<SplitVideoMode>> = [
  { value: "scenes", title: "At scene changes", description: "Where the picture changes." },
  { value: "interval", title: "Evenly", description: "Every few seconds." },
];

const SENSITIVITY_OPTIONS: ReadonlyArray<RadioTileOption<SceneSensitivity>> = [
  { value: "low", title: "Low", description: "Only hard cuts." },
  { value: "medium", title: "Medium", description: "Cuts and big changes." },
  { value: "high", title: "High", description: "Also quick camera moves." },
];

const FRAME_RATE_OPTIONS = frameRateOptions("Keep each video's rate");

interface SplitVideoDialogProps {
  scope: DialogScopeInfo;
  initialSettings: SplitVideoSettings;
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: SplitVideoSettings) => void;
  onCancel: () => void;
}

function parseSeconds(value: string, min: number): number | null {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return trimmed && Number.isFinite(parsed) && parsed >= min && parsed <= MAX_SPLIT_CLIP_SECONDS
    ? parsed
    : null;
}

export function SplitVideoDialog({
  scope,
  initialSettings,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: SplitVideoDialogProps) {
  const [mode, setMode] = useState<SplitVideoMode>(initialSettings.mode);
  const [sensitivity, setSensitivity] = useState<SceneSensitivity>(initialSettings.sensitivity);
  // Held as text so a field can be emptied mid-edit instead of snapping back.
  const [longest, setLongest] = useState(String(initialSettings.longest_seconds));
  const [interval, setInterval] = useState(String(initialSettings.interval_seconds));
  const [shortest, setShortest] = useState(String(initialSettings.shortest_seconds));
  const [frameRate, setFrameRate] = useState<FrameRateChoice>(
    frameRateChoice(initialSettings.frame_rate),
  );
  const [error, setError] = useState<string | null>(null);
  const lengthId = useId();
  const shortestId = useId();
  const errorId = useId();

  const scenes = mode === "scenes";
  const length = scenes ? longest : interval;
  const setLength = scenes ? setLongest : setInterval;

  const handleConfirm = () => {
    if (busy) return;

    const lengthLabel = scenes ? "The longest clip" : "The clip length";
    const parsedLength = parseSeconds(length, MIN_SPLIT_CLIP_SECONDS);
    if (parsedLength === null) {
      setError(
        `${lengthLabel} must be from ${MIN_SPLIT_CLIP_SECONDS} to ${MAX_SPLIT_CLIP_SECONDS} seconds.`,
      );
      return;
    }
    const parsedShortest = parseSeconds(shortest, 0);
    if (parsedShortest === null) {
      setError(`The shortest clip must be from 0 to ${MAX_SPLIT_CLIP_SECONDS} seconds.`);
      return;
    }
    if (parsedShortest > parsedLength) {
      setError(`The shortest clip cannot be longer than ${lengthLabel.toLowerCase()}.`);
      return;
    }

    setError(null);
    onConfirm({
      mode,
      sensitivity,
      // The other mode's length travels unchanged, so it is remembered for next time.
      longest_seconds: scenes ? parsedLength : initialSettings.longest_seconds,
      interval_seconds: scenes ? initialSettings.interval_seconds : parsedLength,
      shortest_seconds: parsedShortest,
      frame_rate: frameRateFromChoice(frameRate),
    });
  };

  const editField = (set: (value: string) => void) => (value: string) => {
    set(value);
    setError(null);
  };

  return (
    <GuardedDialog
      unsavedChanges={
        mode !== initialSettings.mode ||
        sensitivity !== initialSettings.sensitivity ||
        longest !== String(initialSettings.longest_seconds) ||
        interval !== String(initialSettings.interval_seconds) ||
        shortest !== String(initialSettings.shortest_seconds) ||
        frameRate !== frameRateChoice(initialSettings.frame_rate)
      }
      scope={scope}
      title="Split into clips?"
      description={
        <>
          Cuts each video into MP4 clips in the <strong>{CLIPS_DIR_NAME}</strong> folder. The videos
          and their captions stay as they are. Splitting a video again replaces its earlier clips
          and their captions.
        </>
      }
      panelClassName="split-video-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      describedById={error ? errorId : undefined}
      footer={
        <DialogActions
          confirmLabel={confirmLabel ?? "Split videos"}
          busyLabel="Starting..."
          onCancel={onCancel}
        />
      }
    >
      <RadioTileGroup
        value={mode}
        options={MODE_OPTIONS}
        label="Cut"
        name="split-video-mode"
        groupLabel="Where to cut"
        disabled={busy}
        onChange={(value) => {
          setMode(value);
          setError(null);
        }}
      />

      {/* Shown in both modes, so switching never moves the buttons. */}
      <RadioTileGroup
        value={sensitivity}
        options={SENSITIVITY_OPTIONS}
        label="Scene sensitivity"
        name="split-video-sensitivity"
        groupLabel="Scene sensitivity"
        disabled={busy || !scenes}
        onChange={setSensitivity}
      />

      <div className="dialog__field">
        <div className="split-video-dialog__row">
          <div>
            <label htmlFor={lengthId} className="dialog__label">
              {scenes ? "Longest clip (s)" : "Clip length (s)"}
            </label>
            <input
              id={lengthId}
              type="number"
              className="dialog__input split-video-dialog__number"
              value={length}
              min={MIN_SPLIT_CLIP_SECONDS}
              max={MAX_SPLIT_CLIP_SECONDS}
              step={0.5}
              onChange={(event) => editField(setLength)(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={shortestId} className="dialog__label">
              Shortest clip (s)
            </label>
            <input
              id={shortestId}
              type="number"
              className="dialog__input split-video-dialog__number"
              value={shortest}
              min={0}
              max={MAX_SPLIT_CLIP_SECONDS}
              step={0.5}
              onChange={(event) => editField(setShortest)(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </div>
        </div>
        <p className="dialog__hint">
          {scenes
            ? "A longer scene is divided into equal parts. Shorter pieces are left out."
            : "The last piece of each video is usually shorter. Shorter pieces are left out."}
        </p>
        {error && (
          <p id={errorId} className="dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogSelect
        label="Frame rate"
        value={frameRate}
        options={FRAME_RATE_OPTIONS}
        disabled={busy}
        onChange={setFrameRate}
      />
    </GuardedDialog>
  );
}
