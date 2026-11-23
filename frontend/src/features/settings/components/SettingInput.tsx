import { TextInput } from "@/shared/ui/Field";
import { Badge, type BadgeTone } from "@/shared/ui/Badge";
import { IconButton } from "@/shared/ui/IconButton";
import { iconRotateCcw, iconUndo2 } from "@/shared/icons";
import { useId } from "react";
import { classNames } from "@/shared/lib/classNames";
import type { AppSettingKey, AppSettingsResponse } from "@/shared/types";
import { SETTING_FIELDS } from "../lib/settingsForm";

type SettingState = AppSettingsResponse[AppSettingKey];

const INPUT_TYPES = {
  url: "url",
  text: "text",
  integer: "number",
  decimal: "number",
  secret: "password",
} as const;

function fallbackName(state: SettingState): string {
  return state.fallback_source === "env" ? ".env value" : "default";
}

function describeSource(
  state: SettingState,
  edited: boolean,
  pendingReset: boolean,
): { tone: BadgeTone; badge: string; title?: string; detail?: string } {
  const fallback = fallbackName(state);
  if (pendingReset) {
    return { tone: "warning", badge: "Will reset", detail: `Returns to the ${fallback} on save` };
  }
  if (edited) return { tone: "warning", badge: "Edited" };

  switch (state.source) {
    case "default":
      return { tone: "neutral", badge: "is_set" in state ? "Not set" : "Default" };
    case "env":
      return { tone: "accent", badge: ".env", title: "From .env or the environment" };
    case "saved":
      return {
        tone: "success",
        badge: "Saved",
        detail:
          "value" in state
            ? `Overrides ${fallback} ${state.fallback}`
            : `Overrides the ${fallback}`,
      };
  }
}

function placeholderFor(state: SettingState): string {
  if ("value" in state) return String(state.fallback);
  return state.is_set ? "Saved key is hidden" : "No key";
}

interface SettingInputProps {
  settingKey: AppSettingKey;
  state: SettingState;
  value: string;
  edited: boolean;
  pendingReset: boolean;
  invalid: boolean;
  disabled: boolean;
  /** Offered as the user types, e.g. the model ids a server reported. */
  suggestions?: readonly string[];
  onChange: (value: string) => void;
  onReset: () => void;
  onUndoReset: () => void;
}

export function SettingInput({
  settingKey,
  state,
  value,
  edited,
  pendingReset,
  invalid,
  disabled,
  suggestions = [],
  onChange,
  onReset,
  onUndoReset,
}: SettingInputProps) {
  const inputId = useId();
  const badgeId = useId();
  const detailId = useId();
  const listId = useId();
  const field = SETTING_FIELDS[settingKey];
  const source = describeSource(state, edited, pendingReset);
  const resettable = state.source === "saved";
  const resetTarget =
    "value" in state
      ? `Reset to the ${fallbackName(state)}, ${state.fallback}`
      : `Reset to the ${fallbackName(state)}`;
  const secret = field.kind === "secret";
  const range = "minimum" in state ? state : null;

  return (
    <div className="setting-field">
      <div className="setting-field__head">
        <label className="field__label setting-field__label" htmlFor={inputId}>
          {field.label}
          {/* The unit shows inside the field; the label only names it for assistive tech. */}
          {field.unit && (
            <>
              {" "}
              <span className="setting-field__label-unit">({field.unit})</span>
            </>
          )}
        </label>
        <Badge
          id={badgeId}
          tone={source.tone}
          uppercase={false}
          title={source.title ?? source.detail}
        >
          {source.badge}
        </Badge>
      </div>
      <TextInput
        id={inputId}
        className={classNames("setting-field__input", range && "setting-field__input--number")}
        // Always set, so the input is not remounted when a save makes it resettable.
        end={
          (field.unit || resettable) && (
            <>
              {field.unit && <span aria-hidden="true">{field.unit}</span>}
              {resettable && (
                // One button that flips, so focus stays put after either click.
                <IconButton
                  icon={pendingReset ? iconUndo2 : iconRotateCcw}
                  label={pendingReset ? `Undo reset of ${field.label}` : `Reset ${field.label}`}
                  tooltip={pendingReset ? "Keep the saved value" : resetTarget}
                  size="2xs"
                  variant="ghost"
                  disabled={disabled}
                  onClick={pendingReset ? onUndoReset : onReset}
                />
              )}
            </>
          )
        }
        type={INPUT_TYPES[field.kind]}
        min={range?.minimum}
        max={range?.maximum ?? undefined}
        step={range ? (field.step ?? 1) : undefined}
        spellCheck={false}
        autoComplete={secret ? "new-password" : "off"}
        placeholder={placeholderFor(state)}
        list={suggestions.length ? listId : undefined}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={source.detail ? `${badgeId} ${detailId}` : badgeId}
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {source.detail && (
        <span id={detailId} className="setting-field__detail">
          {source.detail}
        </span>
      )}
    </div>
  );
}
