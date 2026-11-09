import { describe, expect, it } from "vitest";
import {
  collapseDiffContext,
  countChangedWords,
  diffCaptionWords,
  WORD_DIFF_CELL_LIMIT,
} from "./captionWordDiff";

function sides(before: string, after: string) {
  const segments = diffCaptionWords(before, after);
  return {
    before: segments.map((s) => (s.kind === "added" ? "" : s.text)).join(""),
    after: segments.map((s) => (s.kind === "removed" ? "" : s.text)).join(""),
  };
}

describe("diffCaptionWords", () => {
  it("keeps identical text as one unchanged run", () => {
    expect(diffCaptionWords("a dog in a field", "a dog in a field")).toEqual([
      { kind: "same", text: "a dog in a field" },
    ]);
  });

  it("returns nothing for two empty captions", () => {
    expect(diffCaptionWords("", "")).toEqual([]);
  });

  it("marks a swapped word without touching its neighbours", () => {
    expect(diffCaptionWords("a red dog runs", "a blue dog runs")).toEqual([
      { kind: "same", text: "a " },
      { kind: "removed", text: "red" },
      { kind: "added", text: "blue" },
      { kind: "same", text: " dog runs" },
    ]);
  });

  it("reads adjacent replaced words as one swap", () => {
    expect(diffCaptionWords("a red dog", "a blue cat")).toEqual([
      { kind: "same", text: "a " },
      { kind: "removed", text: "red dog" },
      { kind: "added", text: "blue cat" },
    ]);
  });

  it("marks insertions at the start and the end", () => {
    expect(diffCaptionWords("dog in a field", "photo, dog in a field, sunset")).toEqual([
      { kind: "added", text: "photo, " },
      { kind: "same", text: "dog in a field" },
      { kind: "added", text: ", sunset" },
    ]);
  });

  it("compares a tag list tag by tag", () => {
    expect(diffCaptionWords("red hair, blue eyes, smile", "red hair, green eyes, smile")).toEqual([
      { kind: "same", text: "red hair, " },
      { kind: "removed", text: "blue" },
      { kind: "added", text: "green" },
      { kind: "same", text: " eyes, smile" },
    ]);
  });

  it("marks a removed word", () => {
    expect(diffCaptionWords("a small brown dog", "a brown dog")).toEqual([
      { kind: "same", text: "a " },
      { kind: "removed", text: "small " },
      { kind: "same", text: "brown dog" },
    ]);
  });

  it("shows a complete rewrite as one removal and one addition", () => {
    expect(diffCaptionWords("a dog", "two cats")).toEqual([
      { kind: "removed", text: "a dog" },
      { kind: "added", text: "two cats" },
    ]);
  });

  it("shows a whitespace-only change", () => {
    expect(diffCaptionWords("a dog\r\nin a field", "a dog in a field")).toEqual([
      { kind: "same", text: "a dog" },
      { kind: "removed", text: "\r\n" },
      { kind: "added", text: " " },
      { kind: "same", text: "in a field" },
    ]);
  });

  it("aligns on words, not on the spaces between them", () => {
    // Spaces outnumber the shared words here; aligning on them pairs up unrelated lines.
    const before =
      "A kettle on a stove.\nSteam rises from the spout.\nMorning light fills the room.";
    const after = "A kettle on a stove.\nMorning light fills the room.\nA cat sleeps on the sill.";

    expect(diffCaptionWords(before, after)).toEqual([
      { kind: "same", text: "A kettle on a stove." },
      { kind: "removed", text: "\nSteam rises from the spout." },
      { kind: "same", text: "\nMorning light fills the room." },
      { kind: "added", text: "\nA cat sleeps on the sill." },
    ]);
  });

  it("shows every match of a repeated replacement on its own", () => {
    expect(diffCaptionWords("a red car by a red barn", "a blue car by a blue barn")).toEqual([
      { kind: "same", text: "a " },
      { kind: "removed", text: "red" },
      { kind: "added", text: "blue" },
      { kind: "same", text: " car by a " },
      { kind: "removed", text: "red" },
      { kind: "added", text: "blue" },
      { kind: "same", text: " barn" },
    ]);
  });

  it("treats captions that share only stray words as one rewrite", () => {
    const before = "Close-up portrait of an elderly man with a grey beard.";
    const after = "The harbour at night: boats moored along a wooden pier.";

    expect(diffCaptionWords(before, after)).toEqual([
      { kind: "removed", text: before },
      { kind: "added", text: after },
    ]);
  });

  it("keeps a shared opening when the rest is rewritten", () => {
    expect(
      diffCaptionWords(
        "A photo of a man with a grey beard in a dim room",
        "A photo of boats moored along a wooden pier at night",
      ),
    ).toEqual([
      { kind: "same", text: "A photo of " },
      { kind: "removed", text: "a man with a grey beard in a dim room" },
      { kind: "added", text: "boats moored along a wooden pier at night" },
    ]);
  });

  it("rebuilds both captions exactly from the segments", () => {
    const pairs: Array<[string, string]> = [
      ["  a dog  ", "a  dog\n"],
      ["red,blue", "red, blue , green"],
      ["", " new caption "],
      ["one\r\ntwo\n\nthree", "one two\nthree four"],
      ["a small brown dog", "brown dog a small"],
    ];

    for (const [before, after] of pairs) {
      expect(sides(before, after)).toEqual({ before, after });
    }
  });

  it("falls back to one swap when the changed middle is too large to align", () => {
    const words = Math.ceil(Math.sqrt(WORD_DIFF_CELL_LIMIT));
    const before = `start ${Array.from({ length: words }, (_, i) => `a${i}`).join(" ")} end`;
    const after = `start ${Array.from({ length: words }, (_, i) => `b${i}`).join(" ")} end`;

    const segments = diffCaptionWords(before, after);

    expect(segments.map((segment) => segment.kind)).toEqual(["same", "removed", "added", "same"]);
    expect(segments[0].text).toBe("start ");
    expect(segments[3].text).toBe(" end");
    expect(segments.map((s) => (s.kind === "added" ? "" : s.text)).join("")).toBe(before);
    expect(segments.map((s) => (s.kind === "removed" ? "" : s.text)).join("")).toBe(after);
  });
});

describe("countChangedWords", () => {
  it("counts the words each side alone has, ignoring punctuation and spaces", () => {
    const segments = diffCaptionWords("red hair, blue eyes", "red hair, green eyes, smiling");

    expect(countChangedWords(segments)).toEqual({ removed: 1, added: 2 });
  });

  it("counts nothing for identical captions", () => {
    expect(countChangedWords(diffCaptionWords("a dog", "a dog"))).toEqual({ removed: 0, added: 0 });
  });
});

describe("collapseDiffContext", () => {
  const filler = (word: string, count: number) =>
    Array.from({ length: count }, () => word).join(" ");

  it("shortens long unchanged runs around each change and keeps the changes whole", () => {
    const before = `${filler("start", 30)} red ${filler("middle", 40)} red ${filler("end", 30)}`;
    const after = before.replaceAll("red", "crimson and scarlet");

    const collapsed = collapseDiffContext(diffCaptionWords(before, after), 20);

    expect(collapsed.map((segment) => segment.kind)).toEqual([
      "same",
      "removed",
      "added",
      "same",
      "removed",
      "added",
      "same",
    ]);
    expect(collapsed[0].text).toBe("…start start start ");
    expect(collapsed[2].text).toBe("crimson and scarlet");
    expect(collapsed[3].text).toBe(" middle middle … middle middle ");
    expect(collapsed[6].text).toBe(" end end end end…");
  });

  it("leaves short context and unchanged captions alone", () => {
    const short = diffCaptionWords("a red dog runs", "a blue dog runs");
    expect(collapseDiffContext(short, 20)).toEqual(short);

    const unchanged = diffCaptionWords(filler("word", 60), filler("word", 60));
    expect(collapseDiffContext(unchanged, 20)).toEqual(unchanged);
  });

  it("cuts inside a run with no spaces rather than keeping all of it", () => {
    const before = `${"x".repeat(80)} red`;
    const collapsed = collapseDiffContext(diffCaptionWords(before, `${"x".repeat(80)} blue`), 20);

    expect(collapsed[0].text).toBe(`…${"x".repeat(19)} `);
  });
});
