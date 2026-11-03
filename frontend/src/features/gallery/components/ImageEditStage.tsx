import { useRef, useState, type CSSProperties } from "react";
import { swapsAxes } from "@/features/gallery/lib/imageEdit";
import { classNames } from "@/shared/lib/classNames";
import { iconMinimize2 } from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";
import { imageOriginalUrl } from "@/features/gallery/api/imageEdit";
import { fillPreviewUrl } from "@/features/gallery/api/imageFill";
import { useStageZoom } from "@/features/gallery/hooks/useStageZoom";
import { AdjustCanvas } from "./AdjustCanvas";
import { CropOverlay } from "./CropOverlay";
import { FillOverlay } from "./FillOverlay";
import { MaskOverlay } from "./MaskOverlay";
import type { AdjustedPicture } from "@/features/gallery/lib/adjustedPicture";
import type { ImageEdit } from "@/features/gallery/hooks/useImageEdit";

interface ImageEditStageProps {
  edit: ImageEdit;
  /** The file being edited: its original shows until the draft has fills, which the server
   * composites onto it. */
  path: string;
  alt: string;
  disabled: boolean;
}

/** Measures nothing: a rotated img lays out upright. __canvas must be absolute for the overlays. */
export function ImageEditStage({ edit, path, alt, disabled }: ImageEditStageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [picture, setPicture] = useState<AdjustedPicture | null>(null);
  const [covered, setCovered] = useState(false);
  const { fill } = edit;
  // Every tool works on the filled picture, so crop, blur and Adjust show what Apply writes.
  const src = imageOriginalUrl(path);
  const shown = fill.previewIds.length > 0 ? fillPreviewUrl(path, fill.previewIds) : src;

  const turned = swapsAxes(edit.draft.rotate);
  const comparable = !disabled && fill.candidate !== null && !fill.candidateStale;
  // The Fill tool's own: a brush wants close-up work, and the wheel means nothing to the others.
  const zoom = useStageZoom({
    stageRef,
    canvasRef,
    active: edit.fillActive,
    turned,
    resetKey: path,
    onAltWheel: fill.stepBrush,
  });
  const zoomed = zoom.view.scale > 1;

  const canvasStyle = {
    "--edit-zoom": zoom.view.scale,
    "--edit-pan-x": `${zoom.view.x}px`,
    "--edit-pan-y": `${zoom.view.y}px`,
    "--edit-rotate": `${edit.draft.rotate}deg`,
    "--edit-flip-x": edit.draft.mirrorH ? -1 : 1,
    "--edit-flip-y": edit.draft.mirrorV ? -1 : 1,
  } as CSSProperties;

  return (
    <div
      ref={stageRef}
      className={classNames(
        "image-edit-stage",
        turned && "image-edit-stage--turned",
        zoomed && "image-edit-stage--zoomed",
        zoom.panning && "image-edit-stage--panning",
      )}
      {...zoom.handlers}
    >
      <div ref={canvasRef} className="image-edit-stage__canvas" style={canvasStyle}>
        <img
          ref={imageRef}
          className={classNames(
            "image-edit-stage__img",
            // Hidden, not removed: it still sizes the stage and feeds the preview its pixels.
            covered && "image-edit-stage__img--covered",
          )}
          src={shown}
          alt={alt}
          draggable={false}
          onLoad={(event) => edit.handleLoad(event.currentTarget)}
          onError={() => {
            if (shown !== src) fill.reportPreviewError();
          }}
        />
        <AdjustCanvas
          key={shown}
          mediaRef={imageRef}
          sourceWidth={edit.sourceWidth}
          sourceHeight={edit.sourceHeight}
          crop={edit.draft.crop}
          scale={edit.draft.scale}
          controls={edit.adjust}
          onPictureChange={setPicture}
          onShowingChange={setCovered}
        />
        {edit.draft.masks.length > 0 && !edit.adjust.zoomed && (
          <MaskOverlay
            mediaRef={imageRef}
            src={shown}
            masks={edit.draft.masks}
            selectedId={edit.selectedMaskId}
            sourceWidth={edit.sourceWidth}
            sourceHeight={edit.sourceHeight}
            orientation={edit.orientation}
            disabled={disabled}
            interactive={edit.maskActive}
            picture={picture}
            onSelect={edit.selectMask}
            onChange={edit.setMaskRect}
            onRemove={edit.removeMask}
          />
        )}
        {edit.fillActive && (
          <FillOverlay
            mediaRef={imageRef}
            sourceWidth={edit.sourceWidth}
            sourceHeight={edit.sourceHeight}
            orientation={edit.orientation}
            strokes={fill.strokes}
            brushRadius={fill.brushRadius}
            erasing={fill.brushMode === "erase"}
            interactive={!disabled && edit.ready && fill.canPaint}
            showStrokes={fill.candidate === null}
            working={fill.generating}
            onCompare={comparable ? fill.setShowBefore : undefined}
            onStroke={fill.addStroke}
          />
        )}
        {edit.cropActive && (
          <CropOverlay
            mediaRef={imageRef}
            crop={edit.draft.crop}
            sourceWidth={edit.sourceWidth}
            sourceHeight={edit.sourceHeight}
            aspectRatio={edit.aspectRatio}
            orientation={edit.orientation}
            disabled={disabled}
            onCropChange={edit.setCrop}
          />
        )}
      </div>
      {zoomed && (
        <div className="image-edit-stage__zoom">
          <span className="image-edit-stage__zoom-level">{Math.round(zoom.view.scale * 100)}%</span>
          <button type="button" className="image-edit-stage__zoom-fit" onClick={zoom.reset}>
            <Icon icon={iconMinimize2} />
            Fit
          </button>
        </div>
      )}
    </div>
  );
}
