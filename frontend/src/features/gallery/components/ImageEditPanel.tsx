import { useTabList } from "@/shared/hooks/useTabList";
import { useEffect, useMemo, useState } from "react";
import { isIdentityCrop } from "@/features/gallery/lib/crop";
import {
  formatRotation,
  scaleForTargetHeight,
  scaleForTargetWidth,
} from "@/features/gallery/lib/imageEdit";
import { describeMasks } from "@/features/gallery/lib/mask";
import { describeFills } from "@/features/gallery/lib/fillMask";
import { isAdjustIdentity } from "@/features/gallery/lib/colorAdjust";
import {
  iconCrop,
  iconDroplets,
  iconFlipHorizontal,
  iconFlipVertical,
  iconMaximize2,
  iconRotateCcw,
  iconRotateCw,
  iconSliders,
  iconPalette,
  iconSparkles,
} from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";
import type { ImageEdit } from "@/features/gallery/hooks/useImageEdit";
import { EffectOutput, EffectTools } from "./EffectTools";
import { AdjustTools } from "./AdjustTools";
import { FillTools } from "./FillTools";
import {
  ApplyProgress,
  AspectTools,
  BlurTools,
  EditActions,
  OutputChange,
  OutputPart,
  PresetButton,
  SizeTools,
  ToolHint,
  ToolPresets,
  ToolTabs,
  type EditTool,
} from "./EditPanelParts";
import {
  BLUR_HINT,
  EFFECTS_HINT,
  CROP_HINT,
  SIZE_HINT,
  type ToolHintEntry,
} from "@/features/gallery/lib/toolHints";

type ToolId = "crop" | "blur" | "rotate" | "size" | "effects" | "adjust" | "fill";

const TOOLS: ReadonlyArray<EditTool<ToolId>> = [
  { id: "crop", label: "Crop", icon: iconCrop },
  { id: "size", label: "Size", icon: iconMaximize2 },
  { id: "rotate", label: "Rotate", icon: iconRotateCw },
  { id: "adjust", label: "Adjust", icon: iconSliders },
  { id: "effects", label: "Effects", icon: iconPalette },
  { id: "blur", label: "Blur", icon: iconDroplets },
  { id: "fill", label: "Fill", icon: iconSparkles },
];

// Adjust and Fill have their own, which follow the wand and the generation.
const HINTS: Partial<Record<ToolId, ToolHintEntry>> = {
  crop: CROP_HINT,
  size: SIZE_HINT,
  rotate: { message: "Turns go in quarter steps; flips mirror the picture." },
  effects: EFFECTS_HINT,
  blur: BLUR_HINT,
};

interface ImageEditPanelProps {
  edit: ImageEdit;
  busy: boolean;
  onRevertRequested: () => void;
}

export function ImageEditPanel({ edit, busy, onRevertRequested }: ImageEditPanelProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("crop");

  const locked = !edit.ready || busy || edit.applying;
  const source = useMemo(
    () => ({ width: edit.sourceWidth, height: edit.sourceHeight }),
    [edit.sourceHeight, edit.sourceWidth],
  );
  const modified: Record<ToolId, boolean> = {
    crop: !isIdentityCrop(edit.draft.crop),
    blur: edit.draft.masks.length > 0,
    rotate: edit.draft.rotate !== 0 || edit.draft.mirrorH || edit.draft.mirrorV,
    size: edit.draft.scale !== 1 || edit.draft.fit !== null,
    adjust: !isAdjustIdentity(edit.draft.adjust),
    effects: Boolean(edit.draft.effect),
    fill: edit.draft.fills.length > 0,
  };

  const { setCropActive, setMaskActive, setFillActive } = edit;
  const { setActive: setAdjustActive } = edit.adjust;

  // Keyed on the tool rather than on the click, or the one the panel opens on is never armed.
  useEffect(() => {
    setCropActive(activeTool === "crop");
    setMaskActive(activeTool === "blur");
    setAdjustActive(activeTool === "adjust");
    setFillActive(activeTool === "fill");
  }, [activeTool, setAdjustActive, setCropActive, setFillActive, setMaskActive]);

  const toolTabs = useTabList(
    TOOLS.map((tool) => tool.id),
    activeTool,
    setActiveTool,
  );

  return (
    <div className="edit-panel" role="group" aria-label="Image editing">
      <div className="edit-panel__tabs-bar">
        <ToolTabs tabs={toolTabs} tools={TOOLS} modified={modified} disabled={locked} />
      </div>

      <div className="edit-panel__body" {...toolTabs.panelProps(activeTool)}>
        <div className="edit-panel__tool-controls">
          {activeTool === "crop" && (
            <AspectTools aspectId={edit.aspectId} disabled={locked} onSelect={edit.selectAspect} />
          )}

          {activeTool === "size" && (
            <SizeTools
              scale={edit.draft.scale}
              fit={edit.draft.fit}
              width={edit.outputWidth}
              height={edit.outputHeight}
              step={1}
              disabled={locked}
              onScale={edit.setScale}
              onWidth={(width) =>
                edit.setScale(
                  scaleForTargetWidth(source, edit.draft.crop, edit.draft.rotate, width),
                )
              }
              onHeight={(height) =>
                edit.setScale(
                  scaleForTargetHeight(source, edit.draft.crop, edit.draft.rotate, height),
                )
              }
            />
          )}

          {activeTool === "rotate" && (
            <>
              <ToolPresets label="Turn">
                <PresetButton disabled={locked} onClick={edit.rotateCounterClockwise}>
                  <Icon icon={iconRotateCcw} />
                  Rotate left
                </PresetButton>
                <PresetButton disabled={locked} onClick={edit.rotateClockwise}>
                  <Icon icon={iconRotateCw} />
                  Rotate right
                </PresetButton>
              </ToolPresets>
              <ToolPresets label="Mirror">
                <PresetButton
                  active={edit.draft.mirrorH}
                  disabled={locked}
                  onClick={edit.toggleMirrorH}
                >
                  <Icon icon={iconFlipHorizontal} />
                  Flip horizontal
                </PresetButton>
                <PresetButton
                  active={edit.draft.mirrorV}
                  disabled={locked}
                  onClick={edit.toggleMirrorV}
                >
                  <Icon icon={iconFlipVertical} />
                  Flip vertical
                </PresetButton>
              </ToolPresets>
            </>
          )}

          {activeTool === "adjust" && <AdjustTools controls={edit.adjust} disabled={locked} />}
          {activeTool === "effects" && (
            <EffectTools effect={edit.draft.effect} onChange={edit.setEffect} disabled={locked} />
          )}

          {activeTool === "blur" && (
            <BlurTools masks={edit} hasRegions={modified.blur} disabled={locked} />
          )}

          {activeTool === "fill" && (
            <FillTools
              fill={edit.fill}
              keptFills={edit.draft.fills.length}
              disabled={locked}
              onUndoFill={edit.undoFill}
            />
          )}
        </div>

        <ToolHint tools={TOOLS} activeTool={activeTool} hint={HINTS[activeTool]} />
      </div>

      <div className="edit-panel__footer">
        <p className="edit-panel__output">
          {edit.ready ? (
            <>
              <OutputChange
                from={`${edit.sourceWidth} x ${edit.sourceHeight}`}
                to={`${edit.outputWidth} x ${edit.outputHeight}`}
              />
              {modified.fill && <OutputPart>{describeFills(edit.draft.fills.length)}</OutputPart>}
              {modified.blur && <OutputPart>{describeMasks(edit.draft.masks.length)}</OutputPart>}
              {modified.rotate && (
                <OutputPart>
                  {formatRotation(edit.draft.rotate)}
                  {edit.draft.mirrorH && " mirrored"}
                  {edit.draft.mirrorV && " flipped"}
                </OutputPart>
              )}
              {edit.draft.effect && (
                <EffectOutput
                  effect={edit.draft.effect}
                  previewAvailable={edit.adjust.previewAvailable}
                />
              )}
              {modified.adjust && (
                <OutputPart>
                  {edit.adjust.previewAvailable
                    ? "Adjusted"
                    : "Adjusted, no live preview in this browser"}
                </OutputPart>
              )}
            </>
          ) : (
            <OutputPart>The tools load with the image.</OutputPart>
          )}
        </p>

        {edit.applying ? (
          <ApplyProgress label="Saving" />
        ) : (
          <EditActions edit={edit} disabled={locked} onRevertRequested={onRevertRequested} />
        )}
      </div>
    </div>
  );
}
