import { describe, expect, it } from "vite-plus/test";
import { layoutWordCloud, type WordCloudBubble } from "@/features/gallery/lib/wordCloud";

const entries = (counts: number[]) =>
  counts.map((count, index) => ({ label: `word${String(index).padStart(2, "0")}`, count }));

const zipf = (length: number) =>
  entries(Array.from({ length }, (_, index) => Math.round(400 / (index + 1))));

const distance = (a: WordCloudBubble, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("layoutWordCloud", () => {
  it("returns nothing when no entry has a count", () => {
    expect(layoutWordCloud([{ label: "empty", count: 0 }]).bubbles).toEqual([]);
  });

  it("packs 32 bubbles without any two overlapping", () => {
    const { bubbles } = layoutWordCloud(zipf(32));

    expect(bubbles).toHaveLength(32);
    for (const [index, a] of bubbles.entries()) {
      for (const b of bubbles.slice(index + 1)) {
        expect(distance(a, b)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it("keeps every bubble inside the reported box", () => {
    const { width, height, bubbles } = layoutWordCloud(zipf(32));

    for (const bubble of bubbles) {
      expect(bubble.x - bubble.r).toBeGreaterThanOrEqual(-1e-6);
      expect(bubble.y - bubble.r).toBeGreaterThanOrEqual(-1e-6);
      expect(bubble.x + bubble.r).toBeLessThanOrEqual(width + 1e-6);
      expect(bubble.y + bubble.r).toBeLessThanOrEqual(height + 1e-6);
    }
  });

  it("gives the most frequent word the largest bubble, nearest the centre", () => {
    const { bubbles } = layoutWordCloud(zipf(32));
    const [first, ...rest] = bubbles;
    const centre = {
      x: bubbles.reduce((sum, bubble) => sum + bubble.x, 0) / bubbles.length,
      y: bubbles.reduce((sum, bubble) => sum + bubble.y, 0) / bubbles.length,
    };
    const meanDistance = (group: WordCloudBubble[]) =>
      group.reduce((sum, bubble) => sum + distance(bubble, centre), 0) / group.length;

    expect(first.label).toBe("word00");
    expect(rest.every((bubble) => bubble.r <= first.r)).toBe(true);
    expect(meanDistance(bubbles.slice(0, 8))).toBeLessThan(meanDistance(bubbles.slice(-8)));
  });

  it("scales weight between the least and most frequent on a square root", () => {
    const { bubbles } = layoutWordCloud(entries([100, 25, 4]));
    const byLabel = Object.fromEntries(bubbles.map((bubble) => [bubble.label, bubble]));

    expect(byLabel.word00.weight).toBe(1);
    expect(byLabel.word01.weight).toBeCloseTo(3 / 8);
    expect(byLabel.word02.weight).toBe(0);
  });

  it("gives every bubble full weight when all counts are equal", () => {
    const { bubbles } = layoutWordCloud(entries([3, 3, 3]));

    expect(bubbles.every((bubble) => bubble.weight === 1)).toBe(true);
  });

  it("breaks a long label over lines and widens its bubble rather than shrink the text", () => {
    const { bubbles } = layoutWordCloud([
      { label: "dog", count: 400 },
      ...entries(Array.from({ length: 30 }, () => 20)),
      { label: "long weathered wooden fence", count: 1 },
    ]);
    const long = bubbles.find((bubble) => bubble.label === "long weathered wooden fence")!;
    const smallest = bubbles.find((bubble) => bubble.label === "word29")!;

    expect(long.lines.length).toBeGreaterThan(1);
    expect(long.lines.join(" ")).toBe("long weathered wooden fence");
    expect(long.fontSize).toBeGreaterThanOrEqual(9);
    expect(long.r).toBeGreaterThan(smallest.r);
  });
});
