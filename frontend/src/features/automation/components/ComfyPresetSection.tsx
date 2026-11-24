import { useId, type ReactNode } from "react";
import type { PresetsState } from "@/features/automation/hooks/useComfyPresets";
import { presetTakes } from "@/features/automation/lib/presetTakes";
import { iconLoader2 } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import type { ComfyPresetSummary } from "@/shared/types";
import { Icon } from "@/shared/ui/Icon";

interface PresetListProps {
  presets: readonly ComfyPresetSummary[];
  value: string;
  labelledById: string;
  disabled: boolean;
  describe: (entry: ComfyPresetSummary) => string;
  onChange: (name: string) => void;
}

/** Every preset at once, with what each one takes, instead of a select that hides the rest. */
function PresetList({
  presets,
  value,
  labelledById,
  disabled,
  describe,
  onChange,
}: PresetListProps) {
  const name = useId();
  return (
    <div className="comfy-preset-list" role="radiogroup" aria-labelledby={labelledById}>
      {presets.map((entry, index) => {
        const checked = entry.name === value;
        const metaId = `${name}-${index}`;
        return (
          <label
            key={entry.name}
            className={classNames(
              "comfy-preset-list__item",
              checked && "comfy-preset-list__item--current",
            )}
          >
            <input
              type="radio"
              className="comfy-preset-list__radio"
              name={name}
              value={entry.name}
              checked={checked}
              disabled={disabled}
              // The visible text runs name and meta together; the meta is the description.
              aria-label={entry.name}
              aria-describedby={metaId}
              onChange={() => onChange(entry.name)}
            />
            {/* Truncated in the narrow column, so the whole name is a hover away. */}
            <span className="comfy-preset-list__name" title={entry.name}>
              {entry.name}
            </span>
            <span
              id={metaId}
              className={classNames(
                "comfy-preset-list__meta",
                entry.generates === null && "comfy-preset-list__meta--problem",
              )}
            >
              {describe(entry)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

interface ComfyPresetSectionProps {
  title?: string;
  state: PresetsState;
  /** The selected preset, or empty when none is. */
  value: string;
  /** The selected preset's name once it has left the list. */
  removed: string | null;
  disabled: boolean;
  /** Shown when the list is empty. */
  emptyHint: ReactNode;
  /** What each row says the preset takes. */
  describe?: (entry: ComfyPresetSummary) => string;
  onChange: (name: string) => void;
  children?: ReactNode;
}

/** The ComfyUI dialogs' left column. */
export function ComfyPresetSection({
  title = "Workflow presets",
  state,
  value,
  removed,
  disabled,
  emptyHint,
  describe = presetTakes,
  onChange,
  children,
}: ComfyPresetSectionProps) {
  const headingId = useId();
  return (
    <section className="comfy-preset-layout__presets" aria-labelledby={headingId}>
      <h3 id={headingId} className="comfy-preset-layout__heading">
        {title}
      </h3>
      {state.status === "loading" && (
        <p className="comfy-preset-fields__loading" role="status">
          <Icon icon={iconLoader2} spin className="comfy-preset-fields__loading-icon" />
          Loading workflow presets...
        </p>
      )}
      {state.status === "error" && (
        <p className="dialog__error" role="alert">
          Could not load workflow presets. {state.message}
        </p>
      )}
      {state.status === "ready" && state.presets.length === 0 && emptyHint}
      {removed !== null && (
        // Nothing else is selected in its place, so nothing unchosen runs.
        <p className="comfy-preset-layout__removed" role="status">
          <strong>{removed}</strong> is no longer listed. Choose another preset.
        </p>
      )}
      {state.status === "ready" && state.presets.length > 0 && (
        <PresetList
          presets={state.presets}
          value={value}
          labelledById={headingId}
          disabled={disabled}
          describe={describe}
          onChange={onChange}
        />
      )}
      {children}
    </section>
  );
}
