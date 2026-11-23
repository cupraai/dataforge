import { describe, expect, it } from "vite-plus/test";
import {
  describeLora,
  loraLabel,
  savesOfRun,
  sheetLayoutText,
  showcaseItemTitle,
  showcaseTotals,
  showcaseTotalsText,
} from "./showcase";

describe("showcase helpers", () => {
  it("titles an item like the backend: label, then the prompt's first line, then its place", () => {
    expect(showcaseItemTitle({ label: " Beach ", prompt_text: "x" }, 1)).toBe("Beach");
    expect(showcaseItemTitle({ label: "", prompt_text: "\n  a cat\nmore" }, 1)).toBe("a cat");
    expect(showcaseItemTitle({ label: "", prompt_text: "" }, 3)).toBe("Item 3");
    const long = showcaseItemTitle({ label: "", prompt_text: "word ".repeat(30) }, 1);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("…")).toBe(true);
  });

  it("reads AI-Toolkit's numbered saves out of either separator", () => {
    expect(describeLora("H3\\run_v7_000001500.safetensors")).toEqual({
      name: "H3\\run_v7_000001500.safetensors",
      stem: "run_v7_000001500",
      run: "run_v7",
      step: 1500,
    });
    expect(describeLora("loras/run_v7.safetensors").step).toBeNull();
  });

  it("labels saves of one run by step and anything else by name", () => {
    const saves = ["a/run_000001000.safetensors", "a/run.safetensors"];
    expect(saves.map((name) => loraLabel(name, saves))).toEqual(["step 1000", "final"]);
    expect(loraLabel("a/run.safetensors", ["a/run.safetensors"])).toBe("run");
    expect(loraLabel("v6.safetensors", ["v6.safetensors", "v7.safetensors"])).toBe("v6");
  });

  it("orders a run's saves by step with the final save last", () => {
    const loras = ["run.safetensors", "run_000001500.safetensors", "run_000000500.safetensors"].map(
      describeLora,
    );
    expect(savesOfRun(loras, "run")).toEqual([
      "run_000000500.safetensors",
      "run_000001500.safetensors",
      "run.safetensors",
    ]);
  });

  it("counts only items that are on, once per LoRA compared", () => {
    const totals = showcaseTotals([{ enabled: true }, { enabled: false }, { enabled: true }], 3);
    expect(totals).toEqual({ items: 2, loras: 3, generations: 6 });
    expect(showcaseTotalsText(totals)).toBe("2 items × 3 LoRAs = 6 generations");
    expect(showcaseTotalsText({ items: 1, loras: 1, generations: 1 })).toBe("1 item");
    expect(sheetLayoutText(totals)).toBe("2 items down, 3 LoRAs across");
    expect(sheetLayoutText({ items: 4, loras: 1, generations: 4 })).toBe("4 items in a grid");
  });
});
