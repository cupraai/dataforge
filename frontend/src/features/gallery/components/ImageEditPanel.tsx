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
  iconLoader2,
  iconMaximize2,
  iconRotateCcw,
  iconRotateCw,
  iconSliders,
  iconSparkles,
} from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";
import type { ImageEdit } from "@/features/gallery/hooks/useImageEdit";
import { AdjustHint, AdjustTools } from "./AdjustTools";
import { FillTools } from "./FillTools";
import {
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
  type ToolHintEntry,
} from "./EditPanelParts";
import { HANDLE_GESTURES, MASK_GESTURES } from "@/features/gallery/lib/stageGestures";
import { FillStatusBar } from "./FillStatusBar";

type ToolId = "crop" | "blur" | "rotate" | "size" | "adjust" | "fill";

const TOOLS: ReadonlyArray<EditTool<ToolId>> = [
  { id: "crop", label: "Crop", icon: iconCrop },
  { id: "size", label: "Size", icon: iconMaximize2 },
  { id: "rotate", label: "Rotate", icon: iconRotateCw },
  { id: "adjust", label: "Adjust", icon: iconSliders },
  { id: "blur", label: "Blur", icon: iconDroplets },
  { id: "fill", label: "Fill", icon: iconSparkles },
];

// Adjust and Fill have their own, which follow the wand and the generation.
const HINTS: Partial<Record<ToolId, ToolHintEntry>> = {
  crop: {
    message: "Drag the frame or its handles on the picture, or pick a ratio.",
    gestures: HANDLE_GESTURES,
  },
  size: { message: "Pick a scale, or type a width or height; the other follows." },
  rotate: { message: "Turns go in quarter steps; flips mirror the picture." },
  blur: { message: "Add a region, then drag it over what to hide.", gestures: MASK_GESTURES },
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

  return (
    <div className="edit-panel" role="group" aria-label="Image editing">
      <div className="edit-panel__tabs-bar">
        <ToolTabs
          tools={TOOLS}
          activeTool={activeTool}
          modified={modified}
          disabled={locked}
          onSelect={setActiveTool}
        />
      </div>

      <div className="edit-panel__body">
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

        {activeTool === "fill" ? (
          edit.ready && <FillStatusBar fill={edit.fill} />
        ) : activeTool === "adjust" ? (
          edit.ready && <AdjustHint controls={edit.adjust} />
        ) : (
          <ToolHint tools={TOOLS} activeTool={activeTool} hint={HINTS[activeTool]} />
        )}
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
          <div className="edit-panel__actions">
            <span className="edit-panel__rendering" role="status">
              <Icon icon={iconLoader2} spin />
              Saving
            </span>
          </div>
        ) : (
          <EditActions
            edit={edit}
            disabled={locked}
            pending={edit.pending}
            onRevertRequested={onRevertRequested}
          />
        )}
      </div>
    </div>
  );
}
