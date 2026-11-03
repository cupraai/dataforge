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
  iconEye,
  iconLoader2,
  iconPencilLine,
  iconRefresh,
  iconTrash2,
  iconUndo2,
  iconWandSparkles,
  iconX,
} from "@/shared/icons";
import type { FillPreset } from "@/shared/types";
import { useGlobalShortcut } from "@/shared/hooks/useGlobalShortcut";
import { ariaKeyShortcuts, SHORTCUTS } from "@/shared/lib/shortcuts";
import { Icon } from "@/shared/ui/Icon";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";
import { PresetButton, ToolGroup, ToolPresets } from "./EditPanelParts";
import { FillStatusBar } from "./FillStatusBar";

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

  // Mounted only while the Fill tool is open, so the keys mean nothing elsewhere. The editor
  // sits in a modal, hence whenLocked; typing in the instruction still types.
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
          <ToolPresets label="Brush">
            <PresetButton
              active={fill.brushMode === "paint"}
              disabled={paintLocked}
              onClick={() => fill.setBrushMode("paint")}
              shortcut={{ definition: SHORTCUTS.fillBrush, label: "Paint the selection" }}
            >
              <Icon icon={iconPencilLine} />
              Paint
            </PresetButton>
            <PresetButton
              active={fill.brushMode === "erase"}
              disabled={paintLocked}
              onClick={() => fill.setBrushMode("erase")}
              shortcut={{ definition: SHORTCUTS.fillEraser, label: "Erase the selection" }}
            >
              <Icon icon={iconEraser} />
              Erase
            </PresetButton>
          </ToolPresets>

          <ToolGroup label="Size" className="edit-panel__tool-actions">
            <Tooltip
              content={
                <ShortcutHint shortcut={SHORTCUTS.fillBrushSize}>
                  Smaller or bigger, or Alt+wheel
                </ShortcutHint>
              }
            >
              <input
                className="edit-panel__range"
                type="range"
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
            <Tooltip
              content={<ShortcutHint shortcut={SHORTCUTS.fillUndoStroke}>Undo stroke</ShortcutHint>}
            >
              <button
                type="button"
                className="edit-panel__control edit-panel__control--icon"
                aria-label="Undo stroke"
                aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.fillUndoStroke)}
                disabled={!canUndoStroke}
                onClick={fill.undoStroke}
              >
                <Icon icon={iconUndo2} />
              </button>
            </Tooltip>
            <Tooltip content="Clear selection">
              <button
                type="button"
                className="edit-panel__control edit-panel__control--icon"
                aria-label="Clear selection"
                disabled={paintLocked || fill.strokes.length === 0}
                onClick={fill.clearStrokes}
              >
                <Icon icon={iconTrash2} />
              </button>
            </Tooltip>
          </ToolGroup>
        </>
      )}

      <ToolGroup label="Instruction" className="edit-panel__tool-actions" grow>
        <input
          className="edit-panel__text"
          type="text"
          aria-label="Instruction"
          placeholder="What goes there, e.g. a wooden bench. Blank removes it."
          maxLength={MAX_FILL_INSTRUCTION_LENGTH}
          value={fill.instruction}
          disabled={requestLocked}
          enterKeyHint="go"
          onChange={(event) => fill.setInstruction(event.currentTarget.value)}
          onKeyDown={onInstructionKey}
        />
      </ToolGroup>

      <ToolPresets label="Preset">
        {PRESETS.map((entry) => (
          <Tooltip key={entry.id} content={entry.tip}>
            <PresetButton
              active={fill.preset === entry.id}
              disabled={requestLocked}
              onClick={() => fill.setPreset(entry.id)}
            >
              {entry.label}
            </PresetButton>
          </Tooltip>
        ))}
      </ToolPresets>

      <ToolGroup label={deciding ? "Result" : "Generate"} className="edit-panel__tool-actions">
        {fill.generating ? (
          <button
            type="button"
            className="edit-panel__control"
            disabled={disabled || fill.progress === "starting"}
            onClick={fill.cancel}
          >
            <Icon icon={iconLoader2} spin />
            Cancel
          </button>
        ) : deciding ? (
          <>
            <button
              type="button"
              className="edit-panel__apply"
              disabled={disabled || fill.candidateStale}
              onClick={fill.keep}
            >
              <Icon icon={iconCheck} />
              Keep fill
            </button>
            <button
              type="button"
              className="edit-panel__control"
              disabled={disabled}
              onClick={fill.discard}
            >
              <Icon icon={iconX} />
              Discard
            </button>
            <Tooltip content="Or hold the picture">
              <button
                type="button"
                className="edit-panel__control"
                aria-pressed={fill.showBefore}
                disabled={disabled || fill.candidateStale}
                onClick={() => fill.setShowBefore(!fill.showBefore)}
              >
                <Icon icon={iconEye} />
                Before
              </button>
            </Tooltip>
            <button
              type="button"
              className="edit-panel__control"
              disabled={disabled || !fill.canGenerate}
              onClick={fill.generate}
            >
              <Icon icon={iconRefresh} />
              Regenerate
            </button>
          </>
        ) : (
          <button
            type="button"
            className="edit-panel__apply"
            disabled={disabled || !fill.canGenerate}
            onClick={fill.generate}
          >
            <Icon icon={iconWandSparkles} />
            Generate
          </button>
        )}
      </ToolGroup>

      {keptFills > 0 && (
        <ToolGroup label="Kept" className="edit-panel__tool-actions">
          <button
            type="button"
            className="edit-panel__control"
            disabled={disabled || fill.generating || deciding}
            onClick={onUndoFill}
          >
            <Icon icon={iconUndo2} />
            Undo last fill
          </button>
        </ToolGroup>
      )}
    </>
  );
}
