import { useId } from "react";
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
import { SHORTCUTS } from "@/shared/lib/shortcuts";
import { Icon } from "@/shared/ui/Icon";
import { PresetButton, ToolGroup, ToolPresets } from "./EditPanelParts";

const PRESETS: ReadonlyArray<{ id: FillPreset; label: string }> = [
  { id: "fast", label: "Fast" },
  { id: "quality", label: "Quality" },
];

interface FillToolsProps {
  fill: ImageFillControls;
  keptFills: number;
  disabled: boolean;
  onUndoFill: () => void;
}

export function FillTools({ fill, keptFills, disabled, onUndoFill }: FillToolsProps) {
  const sizeId = useId();
  const deciding = fill.candidate !== null;
  const paintLocked = disabled || !fill.canPaint;
  const { setBrushMode } = fill;

  // Mounted only while the Fill tool is open, so the letters mean nothing elsewhere. The editor
  // sits in a modal, hence whenLocked; typing in the instruction still types.
  useGlobalShortcut(SHORTCUTS.fillBrush, () => setBrushMode("paint"), {
    enabled: !paintLocked,
    whenLocked: true,
  });
  useGlobalShortcut(SHORTCUTS.fillEraser, () => setBrushMode("erase"), {
    enabled: !paintLocked,
    whenLocked: true,
  });
  const requestLocked = disabled || fill.generating;

  // While a result waits for a decision only its own controls show: the request is settled, and
  // the row has no room for both.
  return (
    <>
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

          <ToolGroup label="Selection" className="edit-panel__tool-actions">
            <label className="edit-panel__field" htmlFor={sizeId}>
              Size
              <input
                id={sizeId}
                className="edit-panel__range"
                type="range"
                min={BRUSH_MIN_FRACTION}
                max={BRUSH_MAX_FRACTION}
                step={BRUSH_FRACTION_STEP}
                value={fill.brushFraction}
                disabled={paintLocked}
                aria-valuetext={`${fill.brushRadius * 2} pixels`}
                onChange={(event) => fill.setBrushFraction(Number(event.currentTarget.value))}
              />
            </label>
            <button
              type="button"
              className="edit-panel__control edit-panel__control--icon"
              aria-label="Undo stroke"
              title="Undo stroke"
              disabled={paintLocked || fill.strokes.length === 0}
              onClick={fill.undoStroke}
            >
              <Icon icon={iconUndo2} />
            </button>
            <button
              type="button"
              className="edit-panel__control edit-panel__control--icon"
              aria-label="Clear selection"
              title="Clear selection"
              disabled={paintLocked || fill.strokes.length === 0}
              onClick={fill.clearStrokes}
            >
              <Icon icon={iconTrash2} />
            </button>
          </ToolGroup>

          <ToolGroup label="Instruction" className="edit-panel__tool-actions">
            <input
              className="edit-panel__text"
              type="text"
              aria-label="Instruction"
              placeholder="Blank removes it, or: a wooden bench"
              maxLength={MAX_FILL_INSTRUCTION_LENGTH}
              value={fill.instruction}
              disabled={requestLocked}
              onChange={(event) => fill.setInstruction(event.currentTarget.value)}
            />
          </ToolGroup>

          <ToolPresets label="Preset">
            {PRESETS.map((entry) => (
              <PresetButton
                key={entry.id}
                active={fill.preset === entry.id}
                disabled={requestLocked}
                onClick={() => fill.setPreset(entry.id)}
              >
                {entry.label}
              </PresetButton>
            ))}
          </ToolPresets>
        </>
      )}

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
            <button
              type="button"
              className="edit-panel__control"
              aria-pressed={fill.showBefore}
              disabled={disabled || fill.candidateStale}
              onClick={() => fill.setShowBefore(!fill.showBefore)}
            >
              <Icon icon={iconEye} />
              {fill.showBefore ? "Showing before" : "Before"}
            </button>
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
