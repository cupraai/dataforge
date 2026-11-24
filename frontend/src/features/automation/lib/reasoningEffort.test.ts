import { describe, expect, it } from "vite-plus/test";
import { nearestEffort } from "./reasoningEffort";

describe("nearestEffort", () => {
  const qwen = ["low", "medium", "xhigh"] as const;

  it("keeps a level the model supports", () => {
    expect(nearestEffort("medium", qwen)).toBe("medium");
  });

  it("moves a missing level to the closest, the stronger on a tie", () => {
    expect(nearestEffort("high", qwen)).toBe("xhigh");
    expect(nearestEffort("max", qwen)).toBe("xhigh");
    expect(nearestEffort("low", ["medium", "max"])).toBe("medium");
  });

  it("keeps the remembered level when there is nothing to choose from", () => {
    expect(nearestEffort("max", null)).toBe("max");
    expect(nearestEffort("max", [])).toBe("max");
  });
});
