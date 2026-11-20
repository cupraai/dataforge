import { IconButton } from "@/shared/ui/IconButton";
import { Button } from "@/shared/ui/Button";
import type { KeyboardEvent } from "react";
import type { ImageFillControls } from "@/features/gallery/hooks/useImageFill";
import {
  BRUSH_FRACTION_STEP,
  BRUSH_MAX_FRACTION,
  BRUSH_MIN_FRACTION,
} from "@/features/gallery/lib/fillMask";
import { MAX_FILL_INSTRUCTION_LENGTH } from "@/shared/constants";
import {
  iconCheck,
  iconEraser,
  iconLoader2,
  iconPencilLine,
  iconRefresh,
  iconSquareSplitHorizontal,
  iconTrash2,
  iconUndo2,
  iconWandSparkles,
  iconX,
} from "@/shared/icons";
import type { FillPreset } from "@/shared/types";
import { useGlobalShortcut } from "@/shared/hooks/useGlobalShortcut";
import { ariaKeyShortcuts, SHORTCUTS } from "@/shared/lib/shortcuts";
import { TextInput } from "@/shared/ui/Field";
import { Slider } from "@/shared/ui/Slider";
import { Icon } from "@/shared/ui/Icon";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";
import { holdToCompareProps } from "@/features/gallery/lib/holdToCompare";
import { ToolChoices, ToolGroup } from "./EditPanelParts";
import { FillStatusBar } from "./FillStatusBar";
import type { BrushMode } from "@/features/gallery/lib/fillMask";
import type { SegmentOption } from "@/shared/ui/SegmentedControl";

const BRUSH_OPTIONS: ReadonlyArray<SegmentOption<BrushMode>> = [
  {
    value: "paint",
    label: "Paint",
    icon: iconPencilLine,
    hint: "Paint the selection",
    shortcut: SHORTCUTS.fillBrush,
  },
  {
    value: "erase",
    label: "Erase",
    icon: iconEraser,
    hint: "Erase the selection",
    shortcut: SHORTCUTS.fillEraser,
  },
];

const PRESETS: ReadonlyArray<{ id: FillPreset; label: string; tip: string }> = [
  { id: "fast", label: "Fast", tip: "Fewer steps: quicker, a little less detail" },
  { id: "quality", label: "Quality", tip: "The full step count: slower, finer detail" },
];

interface FillToolsProps {
  fill: ImageFillControls;
  keptFills: number;
  disabled: boolean;
  onUndoFill: () => void;
}

export function FillTools({ fill, keptFills, disabled, onUndoFill }: FillToolsProps) {
  const deciding = fill.candidate !== null;
  const paintLocked = disabled || !fill.canPaint;
  const requestLocked = disabled || fill.generating;
  const canUndoStroke = !paintLocked && fill.strokes.length > 0;

  // Only while Fill is open; whenLocked since the editor is modal.
  const paintKeys = { enabled: !paintLocked, whenLocked: true };
  useGlobalShortcut(SHORTCUTS.fillBrush, () => fill.setBrushMode("paint"), paintKeys);
  useGlobalShortcut(SHORTCUTS.fillEraser, () => fill.setBrushMode("erase"), paintKeys);
  useGlobalShortcut(
    SHORTCUTS.fillBrushSize,
    (event) => fill.stepBrush(event.key === "]" ? 1 : -1),
    paintKeys,
  );
  useGlobalShortcut(SHORTCUTS.fillUndoStroke, () => fill.undoStroke(), {
    ...paintKeys,
    enabled: canUndoStroke,
  });

  const onInstructionKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (fill.canGenerate) fill.generate();
  };

  return (
    <>
      <FillStatusBar fill={fill} />

      {/* While a result waits, painting is settled; the request stays, to tweak and regenerate. */}
      {!deciding && (
        <>
          <ToolChoices
            label="Brush"
            value={fill.brushMode}
            options={BRUSH_OPTIONS}
            disabled={paintLocked}
            onChange={fill.setBrushMode}
          />

          <ToolGroup label="Size" className="edit-panel__tool-actions">
            <Tooltip
              content={
                <ShortcutHint shortcut={SHORTCUTS.fillBrushSize}>
                  Smaller or bigger, or Alt+wheel
                </ShortcutHint>
              }
            >
              <Slider
                size="sm"
                className="edit-panel__range"
                aria-label="Brush size"
                aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.fillBrushSize)}
                min={BRUSH_MIN_FRACTION}
                max={BRUSH_MAX_FRACTION}
                step={BRUSH_FRACTION_STEP}
                value={fill.brushFraction}
                disabled={paintLocked}
                aria-valuetext={`${fill.brushRadius * 2} pixels`}
                onChange={(event) => fill.setBrushFraction(Number(event.currentTarget.value))}
              />
            </Tooltip>
            {/* The slider announces its own value; this is the same number for the eye. */}
            <span className="edit-panel__readout" aria-hidden="true">
              {fill.brushRadius * 2} px
            </span>
          </ToolGroup>

          <ToolGroup label="Selection" className="edit-panel__tool-actions">
            <IconButton
              icon={iconUndo2}
              label="Undo stroke"
              shortcut={SHORTCUTS.fillUndoStroke}
              size="sm"
              disabled={!canUndoStroke}
              onClick={fill.undoStroke}
            />
            <IconButton
              icon={iconTrash2}
              label="Clear selection"
              size="sm"
              tone="danger"
              disabled={paintLocked || fill.strokes.length === 0}
              onClick={fill.clearStrokes}
            />
          </ToolGroup>
        </>
      )}

      <ToolGroup label="Instruction" className="edit-panel__tool-actions" grow>
        <TextInput
          size="sm"
          aria-label="Instruction"
          placeholder="e.g. a wooden bench; leave blank to remove"
          maxLength={MAX_FILL_INSTRUCTION_LENGTH}
          value={fill.instruction}
          disabled={requestLocked}
          enterKeyHint="go"
          onChange={(event) => fill.setInstruction(event.currentTarget.value)}
          onKeyDown={onInstructionKey}
        />
      </ToolGroup>

      <ToolChoices
        label="Preset"
        value={fill.preset}
        options={PRESETS.map((entry) => ({ value: entry.id, label: entry.label, hint: entry.tip }))}
        disabled={requestLocked}
        onChange={fill.setPreset}
      />

      <ToolGroup label={deciding ? "Result" : "Generate"} className="edit-panel__tool-actions">
        {fill.generating ? (
          <Button
            disabled={disabled || fill.progress === "starting"}
            onClick={fill.cancel}
            size="sm"
          >
            <Icon icon={iconLoader2} spin />
            Cancel
          </Button>
        ) : deciding ? (
          <>
            <Button
              icon={iconCheck}
              className="edit-panel__apply"
              disabled={disabled || fill.candidateStale}
              onClick={fill.keep}
              variant="primary"
              size="sm"
            >
              Keep fill
            </Button>
            <Button icon={iconX} disabled={disabled} onClick={fill.discard} size="sm">
              Discard
            </Button>
            <Tooltip content="Hold to see the original">
              <Button
                icon={iconSquareSplitHorizontal}
                aria-pressed={fill.showBefore}
                disabled={disabled || fill.candidateStale}
                {...holdToCompareProps(fill.setShowBefore)}
                size="sm"
              >
                Before
              </Button>
            </Tooltip>
            <Button
              icon={iconRefresh}
              disabled={disabled || !fill.canGenerate}
              onClick={fill.generate}
              size="sm"
            >
              Regenerate
            </Button>
          </>
        ) : (
          <Button
            icon={iconWandSparkles}
            className="edit-panel__apply"
            disabled={disabled || !fill.canGenerate}
            onClick={fill.generate}
            variant="primary"
            size="sm"
          >
            Generate
          </Button>
        )}
      </ToolGroup>

      {keptFills > 0 && (
        <ToolGroup label="Kept" className="edit-panel__tool-actions">
          <Button
            icon={iconUndo2}
            disabled={disabled || fill.generating || deciding}
            onClick={onUndoFill}
            size="sm"
          >
            Undo last fill
          </Button>
        </ToolGroup>
      )}
    </>
  );
}
