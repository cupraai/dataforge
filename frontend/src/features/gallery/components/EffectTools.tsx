import type { StyleEffect } from "@/shared/types";
import type { SegmentOption } from "@/shared/ui/SegmentedControl";
import { Slider } from "@/shared/ui/Slider";
import { EFFECT_PRESETS, effectGradient, formatEffect } from "@/features/gallery/lib/colorAdjust";
import { OutputPart, ToolChoices, ToolGroup } from "./EditPanelParts";

type EffectChoice = StyleEffect["preset"] | "none";

// Graded once: the looks are fixed, and a chosen one shows its own.
const EFFECT_OPTIONS: ReadonlyArray<SegmentOption<EffectChoice>> = [
  { value: "none", label: "None" },
  ...EFFECT_PRESETS.map(([preset, label]) => ({
    value: preset,
    label,
    swatch: effectGradient(preset),
  })),
];

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
      <ToolChoices
        label="Style"
        value={effect?.preset ?? "none"}
        options={EFFECT_OPTIONS}
        disabled={disabled}
        onChange={(preset) =>
          onChange(preset === "none" ? null : { preset, strength: effect?.strength ?? 1 })
        }
      />
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
