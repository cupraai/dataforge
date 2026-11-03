import { screenDeltaToSource, type Orientation, type Size } from "./crop";

/**
 * The Fill tool's selection: brush strokes in pixels of the EXIF-oriented original, the frame the
 * stage shows before any crop or turn. Strokes stay vectors until Generate, which rasterizes them
 * at the original's full size; undo is popping a stroke.
 */

export type BrushMode = "paint" | "erase";

export interface FillPoint {
  x: number;
  y: number;
}

export interface FillStroke {
  mode: BrushMode;
  /** In original pixels, so a stroke keeps its size whatever the stage's zoom. */
  radius: number;
  points: FillPoint[];
}

/** Brush radius as a fraction of the original's shorter side. */
export const BRUSH_MIN_FRACTION = 0.005;
export const BRUSH_MAX_FRACTION = 0.15;
export const BRUSH_DEFAULT_FRACTION = 0.03;
export const BRUSH_FRACTION_STEP = 0.005;

export function brushRadiusPx(fraction: number, source: Size): number {
  return Math.max(1, Math.round(fraction * Math.min(source.width, source.height)));
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a pointer lands on the upright frame, as fractions of it.
 *
 * `rect` is the overlay's on-screen bounding box. A quarter turn and the mirrors map the box's
 * centre onto itself, so the offset from the centre is undone like any screen delta and measured
 * against the frame's sides as they lie on screen.
 */
export function clientPointToFraction(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
  orientation: Orientation,
): FillPoint {
  const turned = orientation.rotate === 90 || orientation.rotate === 270;
  const across = turned ? rect.height : rect.width;
  const down = turned ? rect.width : rect.height;
  const { dx, dy } = screenDeltaToSource(
    clientX - (rect.left + rect.width / 2),
    clientY - (rect.top + rect.height / 2),
    orientation,
  );
  return {
    x: across > 0 ? 0.5 + dx / across : 0.5,
    y: down > 0 ? 0.5 + dy / down : 0.5,
  };
}

export function describeFills(count: number): string {
  return count === 1 ? "1 fill" : `${count} fills`;
}

export function fractionToSource(point: FillPoint, source: Size): FillPoint {
  return { x: point.x * source.width, y: point.y * source.height };
}

/** Whether anything is left to fill: erasing everything painted still counts as painted here,
 * and the server refuses an empty raster with its own message. */
export function hasPaint(strokes: readonly FillStroke[]): boolean {
  return strokes.some((stroke) => stroke.mode === "paint");
}

/**
 * Draw `strokes` scaled by `scale`. Paint adds `color`; erase cuts back to transparent, so the
 * same pass serves the tinted overlay and the black-and-white raster.
 */
export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: readonly FillStroke[],
  scale: number,
  color: string,
): void {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.fillStyle = color;
    const radius = stroke.radius * scale;
    const [first, ...rest] = stroke.points;
    if (rest.length === 0) {
      context.beginPath();
      context.arc(first.x * scale, first.y * scale, radius, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.lineWidth = radius * 2;
    context.beginPath();
    context.moveTo(first.x * scale, first.y * scale);
    for (const point of rest) context.lineTo(point.x * scale, point.y * scale);
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The selection could not be read"));
    reader.readAsDataURL(blob);
  });
}

/** The selection as a base64 PNG the size of the original: white fills, black keeps. */
export async function rasterizeFillMask(
  strokes: readonly FillStroke[],
  source: Size,
): Promise<string> {
  const paint = document.createElement("canvas");
  paint.width = source.width;
  paint.height = source.height;
  const paintContext = paint.getContext("2d");
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!paintContext || !context) throw new Error("This browser cannot draw the selection");

  drawStrokes(paintContext, strokes, 1, "#fff");
  context.fillStyle = "#000";
  context.fillRect(0, 0, source.width, source.height);
  context.drawImage(paint, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser cannot encode the selection");
  return blobToBase64(blob);
}
