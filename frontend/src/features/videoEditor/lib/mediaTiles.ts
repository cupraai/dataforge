/**
 * Tiles of power-of-two seconds about ``tilePx`` wide; only those in view are fetched.
 * Bounds ignore trim and place, so scrolling and trimming reuse tiles.
 */
import { clipEnd, type Clip, type TimeRange } from "./timeline";

export interface MediaTile {
  /** Source seconds the tile covers. */
  start: number;
  end: number;
  /** Pixels from the clip's left edge, and across, at the timeline's zoom. */
  left: number;
  width: number;
}

export interface TileLevel {
  /** Pixels a tile should take; the tile's seconds are the power of two nearest that. */
  tilePx: number;
  /** The finest tile, in seconds; zooming in further only stretches it. */
  minSeconds: number;
}

/** No more than this many tiles are asked for one clip at once. */
export const MAX_TILES = 48;

/** The seconds per tile at a zoom of ``pxPerSecond`` timeline pixels per second. */
export function tileSeconds(pxPerSecond: number, speed: number, level: TileLevel): number {
  const pxPerSourceSecond = pxPerSecond / speed;
  const exponent = Math.round(Math.log2(level.tilePx / Math.max(pxPerSourceSecond, 1e-6)));
  return Math.max(level.minSeconds, 2 ** exponent);
}

/** The take's tiles inside ``view``; ``levelPx`` may lag the zoom, stretching tiles. */
export function clipTiles(
  clip: Clip,
  view: TimeRange,
  pxPerSecond: number,
  levelPx: number,
  level: TileLevel,
  sourceDuration: number | null = null,
): MediaTile[] {
  const from = Math.max(clip.start, view.start);
  const to = Math.min(clipEnd(clip), view.end);
  if (to <= from) return [];
  const span = tileSeconds(levelPx, clip.speed, level);
  const sourceAt = (time: number) => clip.source_in + (time - clip.start) * clip.speed;
  const limit = sourceDuration ?? Infinity;
  const first = Math.max(0, Math.floor(sourceAt(from) / span));
  const last = Math.ceil(Math.min(sourceAt(to), limit) / span);
  const tiles: MediaTile[] = [];
  for (let index = first; index < last && tiles.length < MAX_TILES; index += 1) {
    const start = index * span;
    const end = Math.min((index + 1) * span, limit);
    if (end <= start) break;
    tiles.push({
      start,
      end,
      left: ((start - clip.source_in) / clip.speed) * pxPerSecond,
      width: ((end - start) / clip.speed) * pxPerSecond,
    });
  }
  return tiles;
}
