import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import { Slider } from "@/shared/ui/Slider";
import { iconImageDown, iconStepBack, iconStepForward } from "@/shared/icons";

interface FrameCaptureBarProps {
  min: number;
  max: number;
  step: number;
  value: number;
  ready: boolean;
  saving: boolean;
  busy: boolean;
  currentLabel: string;
  totalLabel: string;
  hint: string;
  onValueChange: (value: number) => void;
  onStepFrame: (direction: -1 | 1) => void;
  onSave: () => void;
}

export function FrameCaptureBar({
  min,
  max,
  step,
  value,
  ready,
  saving,
  busy,
  currentLabel,
  totalLabel,
  hint,
  onValueChange,
  onStepFrame,
  onSave,
}: FrameCaptureBarProps) {
  const locked = !ready || busy || saving;
  const span = max - min;

  return (
    <div className="video-frame-bar" role="group" aria-label="Frame capture">
      <div className="video-frame-bar__scrubber">
        <IconButton
          icon={iconStepBack}
          label="Previous frame"
          onClick={() => onStepFrame(-1)}
          disabled={locked}
          size="xs"
        />
        <Slider
          className="video-frame-bar__slider"
          min={min}
          // Never NaN: React renders max="NaN". A single-frame source has no span, so give a width.
          max={ready && span > 0 ? max : min + 1}
          step={step}
          value={ready ? value : min}
          disabled={locked}
          onChange={(event) => onValueChange(Number(event.target.value))}
          aria-label="Frame position"
        />
        <IconButton
          icon={iconStepForward}
          label="Next frame"
          onClick={() => onStepFrame(1)}
          disabled={locked}
          size="xs"
        />
        <Button
          variant="primary"
          size="xs"
          icon={iconImageDown}
          busy={saving}
          busyLabel="Saving..."
          className="video-frame-bar__save"
          onClick={onSave}
          disabled={locked}
        >
          Save frame
        </Button>
      </div>

      <div className="video-frame-bar__meta">
        {!ready && <p className="video-frame-bar__hint">{hint}</p>}
        <span className="video-frame-bar__time">
          <span className="video-frame-bar__time-current">{currentLabel}</span>
          <span className="video-frame-bar__time-divider">/</span>
          <span className="video-frame-bar__time-total">{totalLabel}</span>
        </span>
      </div>
    </div>
  );
}
