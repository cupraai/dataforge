import type { StatBucket } from "@/features/gallery/lib/datasetStats";

/** The statistics drawer's content width in px; the cloud is packed to suit it. */
const TARGET_WIDTH = 496;
/** The blob packs wider than tall, roughly this many widths per height. */
const TARGET_ASPECT = 1.6;
/** Share of the target ellipse the circles fill; packing leaves the rest as gaps. */
const PACK_DENSITY = 0.68;
const MAX_RADIUS = 76;
const GAP = 3;
/** Smallest bubble relative to the largest before scaling; area tracks the count. */
const MIN_RELATIVE_RADIUS = 0.36;

/** Inter's average advance per em at medium weight, rounded up so labels rarely touch. */
const CHAR_WIDTH_EM = 0.55;
const LINE_HEIGHT_EM = 1.1;
/** Part of the radius a label may reach; the rest is the bubble's inner margin. */
const LABEL_REACH = 0.9;
const MIN_FONT = 9;
const MAX_FONT = 30;
const FONT_PER_RADIUS = 0.46;
/** Candidate angles around each placed bubble, besides the spots touching two at once. */
const RING_ANGLES = 16;

export interface WordCloudBubble {
  label: string;
  count: number;
  /** 0 for the least frequent entry, 1 for the most; square-root scaled. */
  weight: number;
  /** The label split to fit the circle, one to three lines. */
  lines: string[];
  /** Centre and radius in px, inside a `width` x `height` box. */
  x: number;
  y: number;
  r: number;
  fontSize: number;
}

export interface WordCloudLayout {
  width: number;
  height: number;
  /** Most frequent first. */
  bubbles: WordCloudBubble[];
}

function weightOf(count: number, least: number, most: number): number {
  if (most === least) return 1;
  return (Math.sqrt(count) - Math.sqrt(least)) / (Math.sqrt(most) - Math.sqrt(least));
}

/** Font size, per px of radius, at which `lines` just fit the circle. */
function fitPerRadius(lines: string[]): number {
  const longest = Math.max(...lines.map((line) => line.length));
  const halfWidth = (longest * CHAR_WIDTH_EM) / 2;
  const halfHeight = (lines.length * LINE_HEIGHT_EM) / 2;
  return LABEL_REACH / Math.hypot(halfWidth, halfHeight);
}

/** Every way to break the label at its spaces into one to three lines. */
function lineOptions(label: string): string[][] {
  const words = label.split(" ").filter(Boolean);
  const options = [[label]];
  for (let first = 1; first < words.length; first++) {
    options.push([words.slice(0, first).join(" "), words.slice(first).join(" ")]);
    for (let second = first + 1; second < words.length; second++) {
      options.push([
        words.slice(0, first).join(" "),
        words.slice(first, second).join(" "),
        words.slice(second).join(" "),
      ]);
    }
  }
  return options;
}

/** The line breaks that let the label grow largest, and the radius it needs at least. */
function fitLabel(label: string, radius: number) {
  let lines = [label];
  let perRadius = fitPerRadius(lines);
  for (const option of lineOptions(label)) {
    const candidate = fitPerRadius(option);
    if (candidate > perRadius) {
      lines = option;
      perRadius = candidate;
    }
  }
  const preferred = Math.min(MAX_FONT, Math.max(MIN_FONT, radius * FONT_PER_RADIUS));
  const fontSize = Math.max(MIN_FONT, Math.min(preferred, radius * perRadius));
  // A long label in a small bubble widens the bubble rather than shrinking past legibility.
  return { lines, fontSize, r: Math.max(radius, fontSize / perRadius) };
}

interface Placed {
  x: number;
  y: number;
  r: number;
}

function fits(x: number, y: number, r: number, placed: Placed[]): boolean {
  return placed.every((other) => Math.hypot(x - other.x, y - other.y) >= r + other.r + GAP - 1e-6);
}

/** Spots where a circle of radius `r` touches both `a` and `b`. */
function touchingBoth(a: Placed, b: Placed, r: number): [number, number][] {
  const da = a.r + r + GAP;
  const db = b.r + r + GAP;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > da + db || d < Math.abs(da - db)) return [];
  const along = (da * da - db * db + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, da * da - along * along));
  const px = a.x + (along * dx) / d;
  const py = a.y + (along * dy) / d;
  return [
    [px - (across * dy) / d, py + (across * dx) / d],
    [px + (across * dy) / d, py - (across * dx) / d],
  ];
}

/** Distance from the centre on an ellipse as wide as the target, so the blob grows sideways. */
function spread(x: number, y: number): number {
  return Math.hypot(x / TARGET_ASPECT, y);
}

/** Largest first, each circle takes the free spot touching the pack closest to its centre. */
function pack(radii: number[]): Placed[] {
  const placed: Placed[] = [];
  for (const r of radii) {
    if (placed.length === 0) {
      placed.push({ x: 0, y: 0, r });
      continue;
    }
    const candidates: [number, number][] = [];
    for (const [index, a] of placed.entries()) {
      for (let step = 0; step < RING_ANGLES; step++) {
        const angle = (step / RING_ANGLES) * 2 * Math.PI;
        const distance = a.r + r + GAP;
        candidates.push([a.x + distance * Math.cos(angle), a.y + distance * Math.sin(angle)]);
      }
      for (const b of placed.slice(index + 1)) candidates.push(...touchingBoth(a, b, r));
    }
    let best: [number, number] | null = null;
    for (const [x, y] of candidates) {
      if ((best === null || spread(x, y) < spread(...best)) && fits(x, y, r, placed)) {
        best = [x, y];
      }
    }
    // Past the pack's right edge is always free, should every touching spot be taken.
    const [x, y] = best ?? [Math.max(...placed.map((c) => c.x + c.r)) + r + GAP, 0];
    placed.push({ x, y, r });
  }
  return placed;
}

/**
 * Packs one circle per entry into a wide blob, the most frequent in the middle. A circle's area
 * follows its count; a long label can widen its circle so the text stays legible.
 */
export function layoutWordCloud(entries: StatBucket[]): WordCloudLayout {
  const ranked = entries
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"));
  if (ranked.length === 0) return { width: 0, height: 0, bubbles: [] };

  const most = ranked[0].count;
  const least = ranked[ranked.length - 1].count;
  const weights = ranked.map((entry) => weightOf(entry.count, least, most));
  const relative = weights.map(
    (weight) => MIN_RELATIVE_RADIUS + (1 - MIN_RELATIVE_RADIUS) * weight,
  );
  const targetHeight = TARGET_WIDTH / TARGET_ASPECT;
  const targetArea = PACK_DENSITY * Math.PI * (TARGET_WIDTH / 2) * (targetHeight / 2);
  const relativeArea = relative.reduce((sum, r) => sum + Math.PI * r * r, 0);
  const scale = Math.min(MAX_RADIUS, Math.sqrt(targetArea / relativeArea));

  const fitted = ranked.map((entry, index) => fitLabel(entry.label, relative[index] * scale));
  const placed = pack(fitted.map((fit) => fit.r));

  const left = Math.min(...placed.map((c) => c.x - c.r));
  const top = Math.min(...placed.map((c) => c.y - c.r));
  const right = Math.max(...placed.map((c) => c.x + c.r));
  const bottom = Math.max(...placed.map((c) => c.y + c.r));

  return {
    width: right - left,
    height: bottom - top,
    bubbles: ranked.map((entry, index) => ({
      label: entry.label,
      count: entry.count,
      weight: weights[index],
      lines: fitted[index].lines,
      x: placed[index].x - left,
      y: placed[index].y - top,
      r: placed[index].r,
      fontSize: fitted[index].fontSize,
    })),
  };
}
