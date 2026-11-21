import { useTabList } from "@/shared/hooks/useTabList";
import { Button } from "@/shared/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { isIdentityCrop } from "@/features/gallery/lib/crop";
import { isAdjustIdentity } from "@/features/gallery/lib/colorAdjust";
import {
  SPEED_PRESETS,
  TRIM_LENGTH_PRESETS,
  VOLUME_PRESETS,
  formatSpeed,
  formatVolume,
  hasTrimLength,
  scaleForTargetHeight,
  scaleForTargetWidth,
  trimForLength,
} from "@/features/gallery/lib/videoEdit";
import { describeMasks } from "@/features/gallery/lib/mask";
import { formatFrameTime } from "@/features/gallery/lib/videoFrameCapture";
import {
  iconCrop,
  iconGauge,
  iconMaximize2,
  iconScissors,
  iconOpacity,
  iconPalette,
  iconSwatchBook,
  iconVolume2,
} from "@/shared/icons";
import { VIDEO_FRAME_RATES } from "@/shared/constants";
import type { VideoFrameRate } from "@/shared/types";
import type { SegmentOption } from "@/shared/ui/SegmentedControl";
import type { VideoEdit } from "@/features/gallery/hooks/useVideoEdit";
import { EffectOutput, EffectTools } from "./EffectTools";
import { AdjustTools } from "./AdjustTools";
import {
  ApplyProgress,
  AspectTools,
  BlurTools,
  EditActions,
  OutputChange,
  OutputPart,
  PresetChoices,
  SizeTools,
  ToolGroup,
  ToolHint,
  ToolChoices,
  ToolTabs,
  type EditTool,
} from "./EditPanelParts";
import {
  BLUR_HINT,
  EFFECTS_HINT,
  CROP_HINT,
  SIZE_HINT,
  TRIM_HINT,
  type ToolHintEntry,
} from "@/features/gallery/lib/toolHints";
import { VideoEditTimeline } from "./VideoEditTimeline";

type ToolId = "trim" | "crop" | "blur" | "speed" | "size" | "volume" | "effects" | "adjust";

const TOOLS: ReadonlyArray<EditTool<ToolId>> = [
  { id: "trim", label: "Trim", icon: iconScissors },
  { id: "speed", label: "Speed", icon: iconGauge },
  { id: "volume", label: "Volume", icon: iconVolume2 },
  { id: "crop", label: "Crop", icon: iconCrop },
  { id: "size", label: "Size", icon: iconMaximize2 },
  { id: "adjust", label: "Color", icon: iconPalette },
  { id: "effects", label: "Effects", icon: iconSwatchBook },
  { id: "blur", label: "Blur", icon: iconOpacity },
];

// Null keeps the source's rate; the radio needs a value of its own for it.
const FRAME_RATE_OPTIONS: ReadonlyArray<SegmentOption<VideoFrameRate | "source">> = [
  { value: "source", label: "Source" },
  ...VIDEO_FRAME_RATES.map((rate) => ({ value: rate, label: `${rate} fps` })),
];

const SPEED_HINT = "Changes the length too; the audio keeps its pitch.";

/** The preview plays at the source's rate, so the hint says what the saved file will have. */
function speedHint(frameRate: VideoFrameRate | null, outputSeconds: number): ToolHintEntry {
  if (frameRate === null) return { message: SPEED_HINT };
  const frames = Math.round(outputSeconds * frameRate);
  return {
    message: `Saves ${frames} frames at ${frameRate} fps; the preview plays the source's rate.`,
  };
}

// Color labels itself and follows the wand; Speed's depends on the draft.
const HINTS: Partial<Record<ToolId, ToolHintEntry>> = {
  trim: TRIM_HINT,
  volume: { message: "Applies to the whole clip; Mute removes the sound." },
  crop: CROP_HINT,
  size: SIZE_HINT,
  effects: EFFECTS_HINT,
  blur: BLUR_HINT,
};

interface VideoEditPanelProps {
  edit: VideoEdit;
  busy: boolean;
  onRevertRequested: () => void;
}

export function VideoEditPanel({ edit, busy, onRevertRequested }: VideoEditPanelProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("trim");

  const locked = !edit.ready || busy || edit.applying;
  const source = useMemo(
    () => ({ width: edit.sourceWidth, height: edit.sourceHeight }),
    [edit.sourceHeight, edit.sourceWidth],
  );
  const modified: Record<ToolId, boolean> = {
    trim: edit.draft.trimStart > 0 || (edit.ready && edit.draft.trimEnd < edit.duration),
    crop: !isIdentityCrop(edit.draft.crop),
    blur: edit.draft.masks.length > 0,
    speed: edit.draft.speed !== 1 || edit.draft.frameRate !== null,
    size: edit.draft.scale !== 1 || edit.draft.fit !== null,
    volume: edit.draft.volume !== 1,
    adjust: !isAdjustIdentity(edit.draft.adjust),
    effects: Boolean(edit.draft.effect),
  };

  const { setCropActive, setMaskActive } = edit;
  const { setActive: setAdjustActive } = edit.adjust;

  // Keyed on the tool rather than on the click, or the one the panel opens on is never armed.
  useEffect(() => {
    setCropActive(activeTool === "crop");
    setMaskActive(activeTool === "blur");
    setAdjustActive(activeTool === "adjust");
  }, [activeTool, setAdjustActive, setCropActive, setMaskActive]);

  const toolTabs = useTabList(
    TOOLS.map((tool) => tool.id),
    activeTool,
    setActiveTool,
  );

  return (
    <div className="edit-panel" role="group" aria-label="Video editing">
      <VideoEditTimeline
        duration={edit.duration}
        trimStart={edit.draft.trimStart}
        trimEnd={edit.draft.trimEnd}
        speed={edit.draft.speed}
        frameDuration={edit.frameDuration}
        playheadTime={edit.playheadTime}
        playheadRef={edit.playheadRef}
        playing={edit.playing}
        muted={edit.muted}
        ready={edit.ready}
        disabled={busy || edit.applying}
        onTrimStartChange={edit.setTrimStart}
        onTrimEndChange={edit.setTrimEnd}
        onSeek={edit.seekTo}
        onTogglePlay={edit.togglePlay}
        onToggleMuted={edit.toggleMuted}
      />

      <div className="edit-panel__tabs-bar">
        <ToolTabs tabs={toolTabs} tools={TOOLS} modified={modified} disabled={locked} />
      </div>

      <div className="edit-panel__body" {...toolTabs.panelProps(activeTool)}>
        <div className="edit-panel__tool-controls">
          {activeTool === "trim" && (
            <>
              <ToolGroup label="Trim points" className="edit-panel__tool-actions">
                <Button disabled={locked} onClick={edit.setTrimStartAtPlayhead} size="sm">
                  Set in
                </Button>
                <Button disabled={locked} onClick={edit.setTrimEndAtPlayhead} size="sm">
                  Set out
                </Button>
              </ToolGroup>
              <ToolChoices
                label="Length"
                value={
                  TRIM_LENGTH_PRESETS.find((seconds) =>
                    hasTrimLength(seconds, edit.draft, edit.frameDuration),
                  ) ?? null
                }
                options={TRIM_LENGTH_PRESETS.map((seconds) => ({
                  value: seconds,
                  label: `${seconds}s`,
                  disabled: !trimForLength(seconds, edit.draft, edit.duration, edit.frameDuration),
                }))}
                disabled={locked}
                onChange={edit.setTrimLength}
              />
            </>
          )}

          {activeTool === "speed" && (
            <>
              <PresetChoices
                label="Playback"
                values={SPEED_PRESETS}
                current={edit.draft.speed}
                format={formatSpeed}
                disabled={locked}
                onSelect={edit.setSpeed}
              />
              <ToolChoices
                label="Frame rate"
                value={edit.draft.frameRate ?? "source"}
                options={FRAME_RATE_OPTIONS}
                disabled={locked}
                onChange={(rate) => edit.setFrameRate(rate === "source" ? null : rate)}
              />
            </>
          )}

          {activeTool === "volume" && (
            <PresetChoices
              label="Volume"
              values={VOLUME_PRESETS}
              current={edit.draft.volume}
              format={formatVolume}
              disabled={locked}
              onSelect={edit.setVolume}
            />
          )}

          {activeTool === "adjust" && <AdjustTools controls={edit.adjust} disabled={locked} />}
          {activeTool === "effects" && (
            <EffectTools effect={edit.draft.effect} onChange={edit.setEffect} disabled={locked} />
          )}

          {activeTool === "crop" && (
            <AspectTools aspectId={edit.aspectId} disabled={locked} onSelect={edit.selectAspect} />
          )}

          {activeTool === "size" && (
            <SizeTools
              scale={edit.draft.scale}
              fit={edit.draft.fit}
              width={edit.outputWidth}
              height={edit.outputHeight}
              step={2}
              disabled={locked}
              onScale={edit.setScale}
              onWidth={(width) =>
                edit.setScale(scaleForTargetWidth(source, edit.draft.crop, width))
              }
              onHeight={(height) =>
                edit.setScale(scaleForTargetHeight(source, edit.draft.crop, height))
              }
            />
          )}

          {activeTool === "blur" && (
            <BlurTools masks={edit} hasRegions={modified.blur} disabled={locked} />
          )}
        </div>

        <ToolHint
          tools={TOOLS}
          activeTool={activeTool}
          hint={
            activeTool === "speed"
              ? speedHint(edit.draft.frameRate, edit.outputSeconds)
              : HINTS[activeTool]
          }
        />
      </div>

      <div className="edit-panel__footer">
        <p className="edit-panel__output">
          {edit.ready ? (
            <>
              <OutputChange
                from={`${edit.sourceWidth} x ${edit.sourceHeight}`}
                to={`${edit.outputWidth} x ${edit.outputHeight}`}
              />
              {modified.blur && <OutputPart>{describeMasks(edit.draft.masks.length)}</OutputPart>}
              {edit.draft.frameRate !== null && <OutputPart>{edit.draft.frameRate} fps</OutputPart>}
              {modified.volume && (
                <OutputPart>
                  {edit.draft.volume === 0 ? "Muted" : `Volume ${formatVolume(edit.draft.volume)}`}
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
              <OutputChange
                from={formatFrameTime(edit.duration)}
                to={formatFrameTime(edit.outputSeconds)}
              />
            </>
          ) : (
            <OutputPart>The timeline loads with the video.</OutputPart>
          )}
        </p>

        {edit.applying ? (
          <ApplyProgress
            label="Rendering"
            render={{ progress: edit.progress, onCancel: edit.cancel }}
          />
        ) : (
          <EditActions edit={edit} disabled={locked} onRevertRequested={onRevertRequested} />
        )}
      </div>
    </div>
  );
}
