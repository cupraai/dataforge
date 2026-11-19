import { Button } from "@/shared/ui/Button";
import { useId, type ReactNode } from "react";
import type { TabListState } from "@/shared/hooks/useTabList";
import { TabList } from "@/shared/ui/TabList";
import { CROP_ASPECTS } from "@/features/gallery/lib/crop";
import { SCALE_PRESETS, formatScale } from "@/features/gallery/lib/editSpec";
import { MASK_MODES, MASK_STRENGTHS } from "@/features/gallery/lib/mask";
import type { MaskRegionControls } from "@/features/gallery/hooks/useMaskRegions";
import { iconLoader2, iconPlus, iconTrash2, iconUndo2, type AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { ariaKeyShortcuts, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { SegmentedControl, type SegmentOption } from "@/shared/ui/SegmentedControl";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";
import { formatSizeFit } from "@/shared/lib/sizeFit";
import type { SizeFit } from "@/shared/types";
import { SizeNumberField } from "./SizeNumberField";
import type { ToolHintEntry } from "@/features/gallery/lib/toolHints";
import { StageHint } from "./StageHint";

/** Pieces the image and video edit panels share; both render inside `.edit-panel`. */

export interface EditTool<T extends string> {
  id: T;
  label: string;
  icon: AppIcon;
}

export function ToolTabs<T extends string>({
  tabs,
  tools,
  modified,
  disabled,
}: {
  /** From `useTabList`; the panel's body takes `tabs.panelProps(activeTool)`. */
  tabs: TabListState<T>;
  tools: ReadonlyArray<EditTool<T>>;
  modified: Record<T, boolean>;
  disabled: boolean;
}) {
  return (
    <TabList
      tabs={tabs}
      label="Editing tool"
      item={(id) => {
        const tool = tools.find((entry) => entry.id === id)!;
        return { label: tool.label, icon: tool.icon, mark: modified[id] ? "changed" : undefined };
      }}
      disabled={disabled}
    />
  );
}

export function OutputPart({ children }: { children: ReactNode }) {
  return <span className="edit-panel__output-part">{children}</span>;
}

/** "From to **to**", the shape every before-and-after readout in the bar takes. */
export function OutputChange({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <OutputPart>
      {from}
      <span className="edit-panel__output-arrow"> to </span>
      <strong>{to}</strong>
    </OutputPart>
  );
}

/** A visible caption over what it names; `children` gets the caption's id. */
function ToolCaption({
  label,
  grow,
  children,
}: {
  label: string;
  grow?: boolean;
  children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  return (
    <div className={classNames("edit-panel__group", grow && "edit-panel__group--grow")}>
      <span id={labelId} className="edit-panel__group-label">
        {label}
      </span>
      {children(labelId)}
    </div>
  );
}

/** A captioned control cluster; `grow` takes the row's spare width. */
export function ToolGroup({
  label,
  className,
  grow,
  children,
}: {
  label: string;
  className: string;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <ToolCaption label={label} grow={grow}>
      {(labelId) => (
        <div className={className} role="group" aria-labelledby={labelId}>
          {children}
        </div>
      )}
    </ToolCaption>
  );
}

/** One choice of a few under its caption: the editor's segmented radios. */
export function ToolChoices<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly SegmentOption<T>[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <ToolCaption label={label}>
      {(labelId) => (
        <SegmentedControl
          labelledBy={labelId}
          size="sm"
          className="edit-panel__choices"
          value={value}
          options={options}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </ToolCaption>
  );
}

/** Buttons on the segmented track that are not one choice: toggles that combine, or actions. */
export function ToolPresets({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ToolGroup label={label} className="segmented segmented--sm">
      {children}
    </ToolGroup>
  );
}

/** How the open tool is used, over the media under the tool's own icon. */
export function ToolHint<T extends string>({
  tools,
  activeTool,
  hint,
}: {
  tools: ReadonlyArray<EditTool<T>>;
  activeTool: T;
  hint: ToolHintEntry | undefined;
}) {
  const tool = tools.find((entry) => entry.id === activeTool);
  if (!hint || !tool) return null;
  return <StageHint icon={tool.icon} message={hint.message} gestures={hint.gestures} />;
}

export function PresetButton({
  active,
  disabled,
  onClick,
  shortcut,
  children,
}: {
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  /** Shown in a tooltip and announced; the caller binds the key itself. */
  shortcut?: { definition: ShortcutDefinition; label: string };
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      className="segmented__option edit-panel__preset"
      aria-pressed={active}
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut.definition) : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
  if (!shortcut) return button;
  return (
    <Tooltip content={<ShortcutHint shortcut={shortcut.definition}>{shortcut.label}</ShortcutHint>}>
      {button}
    </Tooltip>
  );
}

/** One option per value, chosen while it is the current one; any other value chooses none. */
export function PresetChoices({
  label,
  values,
  current,
  format,
  disabled,
  onSelect,
}: {
  label: string;
  values: readonly number[];
  current: number | null;
  format: (value: number) => string;
  disabled: boolean;
  onSelect: (value: number) => void;
}) {
  return (
    <ToolChoices
      label={label}
      value={current}
      options={values.map((value) => ({ value, label: format(value) }))}
      disabled={disabled}
      onChange={onSelect}
    />
  );
}

export function AspectTools({
  aspectId,
  disabled,
  onSelect,
}: {
  aspectId: string;
  disabled: boolean;
  onSelect: (aspectId: string) => void;
}) {
  return (
    <ToolChoices
      label="Aspect"
      value={aspectId}
      options={CROP_ASPECTS.map((aspect) => ({ value: aspect.id, label: aspect.label }))}
      disabled={disabled}
      onChange={onSelect}
    />
  );
}

/** Scale presets and W/H; `step` 2 for video. A Resize fit shows as a pressed preset. */
export function SizeTools({
  scale,
  fit,
  width,
  height,
  step,
  disabled,
  onScale,
  onWidth,
  onHeight,
}: {
  scale: number;
  fit: SizeFit | null;
  width: number;
  height: number;
  step: number;
  disabled: boolean;
  onScale: (scale: number) => void;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
}) {
  return (
    <>
      {fit && (
        <ToolPresets label="Fit">
          <PresetButton active disabled={disabled} onClick={() => onScale(1)}>
            {formatSizeFit(fit)}
          </PresetButton>
        </ToolPresets>
      )}
      <PresetChoices
        label="Scale"
        values={SCALE_PRESETS}
        current={fit ? null : scale}
        format={formatScale}
        disabled={disabled}
        onSelect={onScale}
      />
      <ToolGroup label="Pixels" className="edit-panel__fields">
        <SizeNumberField
          label="W"
          className="edit-panel__field"
          value={width}
          min={step}
          step={step}
          disabled={disabled}
          onCommit={onWidth}
        />
        <SizeNumberField
          label="H"
          className="edit-panel__field"
          value={height}
          min={step}
          step={step}
          disabled={disabled}
          onCommit={onHeight}
        />
        <span className="edit-panel__unit" aria-hidden="true">
          px
        </span>
      </ToolGroup>
    </>
  );
}

export function BlurTools({
  masks,
  hasRegions,
  disabled,
}: {
  masks: MaskRegionControls;
  hasRegions: boolean;
  disabled: boolean;
}) {
  return (
    <>
      <ToolGroup label="Regions" className="edit-panel__tool-actions">
        <Button
          icon={iconPlus}
          disabled={disabled || masks.maskLimitReached}
          onClick={masks.addMask}
          size="sm"
        >
          Add
        </Button>
        <Button
          icon={iconTrash2}
          disabled={disabled || !hasRegions}
          onClick={masks.clearMasks}
          size="sm"
        >
          Clear
        </Button>
      </ToolGroup>
      <ToolChoices
        label="Blur style"
        value={masks.maskMode}
        options={MASK_MODES.map((mode) => ({ value: mode.id, label: mode.label }))}
        disabled={disabled}
        onChange={masks.setMaskMode}
      />
      <ToolChoices
        label="Strength"
        value={masks.maskStrength}
        options={MASK_STRENGTHS.map((strength) => ({
          value: strength.value,
          label: strength.label,
        }))}
        // A blackout has nothing to measure, so its strength would go nowhere.
        disabled={disabled || masks.maskMode === "blackout"}
        onChange={masks.setMaskStrength}
      />
    </>
  );
}

interface DraftActions {
  hasBackup: boolean;
  dirty: boolean;
  /** Unsaved work Apply does not take, such as an Auto measurement or an undecided fill: Reset
   * drops it. */
  pending: boolean;
  resetDraft: () => void;
  apply: () => void;
}

interface RenderProgress {
  /** 0 to 1, or null until the render first reports. */
  progress: number | null;
  onCancel: () => void;
}

/** Stands in for the actions while Apply runs: progress and Cancel, or a quick save notice. */
export function ApplyProgress({ label, render }: { label: string; render?: RenderProgress }) {
  if (!render) {
    return (
      <div className="edit-panel__actions">
        <span className="edit-panel__rendering" role="status">
          <Icon icon={iconLoader2} spin />
          {label}
        </span>
      </div>
    );
  }
  const percent = render.progress === null ? null : Math.round(render.progress * 100);
  return (
    <div className="edit-panel__actions">
      <span
        className="edit-panel__rendering"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <Icon icon={iconLoader2} spin />
        {percent === null ? label : `${percent}%`}
      </span>
      <Button onClick={render.onCancel} size="sm">
        Cancel
      </Button>
    </div>
  );
}

/** Revert, Reset and Apply; the panels swap this row for `ApplyProgress` while Apply runs. */
export function EditActions({
  edit,
  disabled,
  onRevertRequested,
}: {
  edit: DraftActions;
  disabled: boolean;
  onRevertRequested: () => void;
}) {
  return (
    <div className="edit-panel__actions">
      {edit.hasBackup && (
        <Button
          icon={iconUndo2}
          variant="warning"
          disabled={disabled}
          onClick={onRevertRequested}
          size="sm"
        >
          Revert original
        </Button>
      )}
      <Button
        disabled={disabled || (!edit.dirty && !edit.pending)}
        onClick={edit.resetDraft}
        size="sm"
      >
        Reset
      </Button>
      <Button
        className="edit-panel__apply"
        disabled={disabled || !edit.dirty || edit.pending}
        onClick={edit.apply}
        variant="primary"
        size="sm"
      >
        Apply
      </Button>
    </div>
  );
}
