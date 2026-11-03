import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Orientation } from "@/features/gallery/lib/crop";
import {
  clientPointToFraction,
  drawStrokes,
  fractionToSource,
  type FillPoint,
  type FillStroke,
} from "@/features/gallery/lib/fillMask";
import { usePaintedBox } from "@/features/gallery/hooks/usePaintedBox";
import { classNames } from "@/shared/lib/classNames";

/** A backing store past this many pixels a side buys nothing a screen can show. */
const MAX_BACKING_SIDE = 2048;

/** Pointer moves closer than this fraction of the radius add nothing but points. */
const MIN_POINT_SPACING = 0.2;

interface FillOverlayProps {
  mediaRef: RefObject<HTMLImageElement | null>;
  sourceWidth: number;
  sourceHeight: number;
  orientation: Orientation;
  strokes: readonly FillStroke[];
  /** In original pixels. */
  brushRadius: number;
  erasing: boolean;
  interactive: boolean;
  /** Off while a result is shown, so the picture is what Keep would add. */
  showStrokes: boolean;
  /** A run is working on the painted selection. */
  working: boolean;
  /** Set while a result can be compared: holding the picture shows it before. */
  onCompare?: (holding: boolean) => void;
  /** A finished stroke. The one in progress is drawn here alone, so a drag re-renders nothing
   * above the overlay. */
  onStroke: (stroke: FillStroke) => void;
}

/** The Fill tool's brush. Drawn in the upright frame inside the stage's turned canvas. */
export function FillOverlay({
  mediaRef,
  sourceWidth,
  sourceHeight,
  orientation,
  strokes,
  brushRadius,
  erasing,
  interactive,
  showStrokes,
  working,
  onCompare,
  onStroke,
}: FillOverlayProps) {
  const box = usePaintedBox(mediaRef, sourceWidth, sourceHeight);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<FillStroke | null>(null);
  // The paint token, read once per full redraw rather than per point of a live stroke.
  const colorRef = useRef("");
  const [cursor, setCursor] = useState<FillPoint | null>(null);

  const scale = Math.min(1, MAX_BACKING_SIDE / Math.max(1, sourceWidth, sourceHeight));
  const backingWidth = Math.max(1, Math.round(sourceWidth * scale));
  const backingHeight = Math.max(1, Math.round(sourceHeight * scale));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, backingWidth, backingHeight);
    // The stylesheet's token, drawn opaque: the element's opacity tints it, so overlapping
    // strokes do not darken where they cross.
    colorRef.current = getComputedStyle(canvas).color;
    if (showStrokes) drawStrokes(context, strokes, scale, colorRef.current);
  }, [backingHeight, backingWidth, scale, showStrokes, strokes]);

  /** Draws the live stroke's newest piece: a dot to start, then a segment from the last point.
   * Paint is opaque and erase clears, so the pieces add up to what the full redraw draws. */
  const drawLive = (points: FillPoint[]) => {
    const context = canvasRef.current?.getContext("2d");
    const live = liveRef.current;
    if (!context || !live) return;
    drawStrokes(context, [{ ...live, points }], scale, colorRef.current);
  };

  const finishStroke = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live) onStroke(live);
  };

  const toSource = (event: PointerEvent<HTMLDivElement>): FillPoint | null => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const fraction = clientPointToFraction(
      event.clientX,
      event.clientY,
      surface.getBoundingClientRect(),
      orientation,
    );
    setCursor(fraction);
    return fractionToSource(fraction, { width: sourceWidth, height: sourceHeight });
  };

  const ringSize = sourceWidth > 0 ? (2 * brushRadius * box.width) / sourceWidth : 0;

  return (
    <div
      ref={surfaceRef}
      className={classNames(
        "fill-overlay",
        interactive && "fill-overlay--interactive",
        onCompare && "fill-overlay--compare",
        working && "fill-overlay--working",
      )}
      style={box}
      data-testid="fill-overlay"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (onCompare) {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onCompare(true);
          return;
        }
        if (!interactive) return;
        const point = toSource(event);
        if (!point) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        liveRef.current = {
          mode: erasing ? "erase" : "paint",
          radius: brushRadius,
          points: [point],
        };
        drawLive([point]);
      }}
      onPointerMove={(event) => {
        const point = toSource(event);
        const live = liveRef.current;
        if (!point || !live || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const last = live.points[live.points.length - 1];
        const spacing = Math.max(1, brushRadius * MIN_POINT_SPACING);
        if (Math.hypot(point.x - last.x, point.y - last.y) < spacing) return;
        live.points.push(point);
        drawLive([last, point]);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishStroke();
        onCompare?.(false);
      }}
      onPointerCancel={() => {
        finishStroke();
        onCompare?.(false);
      }}
      onPointerLeave={() => setCursor(null)}
    >
      <canvas
        ref={canvasRef}
        className="fill-overlay__paint"
        width={backingWidth}
        height={backingHeight}
      />
      {interactive && cursor && (
        <span
          className={classNames("fill-overlay__cursor", erasing && "fill-overlay__cursor--erase")}
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            width: ringSize,
            height: ringSize,
          }}
        />
      )}
    </div>
  );
}
