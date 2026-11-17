import type { StyleEffect } from "@/shared/types";
import { Slider } from "@/shared/ui/Slider";
import { EFFECT_PRESETS, formatEffect } from "@/features/gallery/lib/colorAdjust";
import { OutputPart, PresetButton, ToolGroup, ToolPresets } from "./EditPanelParts";

export function EffectTools({
  effect,
  disabled,
  onChange,
}: {
  effect: StyleEffect | null;
  disabled: boolean;
  onChange: (effect: StyleEffect | null) => void;
}) {
  const strength = Math.round((effect?.strength ?? 1) * 100);
  return (
    <>
      <ToolPresets label="Style">
        <PresetButton active={!effect} disabled={disabled} onClick={() => onChange(null)}>
          None
        </PresetButton>
        {EFFECT_PRESETS.map(([preset, label]) => (
          <PresetButton
            key={preset}
            active={effect?.preset === preset}
            disabled={disabled}
            onClick={() => onChange({ preset, strength: effect?.strength ?? 1 })}
          >
            {label}
          </PresetButton>
        ))}
      </ToolPresets>
      <ToolGroup label="Strength" className="edit-panel__tool-actions">
        <Slider
          size="sm"
          className="edit-panel__range"
          aria-label="Effect strength"
          aria-valuetext={`${strength}%`}
          min={0}
          max={100}
          value={strength}
          disabled={disabled || !effect}
          onChange={(event) =>
            effect && onChange({ ...effect, strength: Number(event.target.value) / 100 })
          }
        />
        {/* The slider announces its own value; this is the same number for the eye. */}
        <span className="edit-panel__readout" aria-hidden="true">
          {strength}%
        </span>
      </ToolGroup>
    </>
  );
}

/** The effect's part of the panel's output line. */
export function EffectOutput({
  effect,
  previewAvailable,
}: {
  effect: StyleEffect;
  previewAvailable: boolean;
}) {
  return (
    <OutputPart>
      {formatEffect(effect)}
      {!previewAvailable && ", no live preview in this browser"}
    </OutputPart>
  );
}
