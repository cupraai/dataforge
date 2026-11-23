import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { useListedPreset } from "./useListedPreset";

type Props = { names: string[] | undefined; wanted: string };

function listed(initial: Props) {
  return renderHook(({ names, wanted }: Props) => useListedPreset(names, wanted), {
    initialProps: initial,
  });
}

describe("useListedPreset", () => {
  it("shows the wanted preset before the list is known", () => {
    const { result, rerender } = listed({ names: undefined, wanted: "b" });
    expect(result.current.preset).toBe("b");

    rerender({ names: ["a", "b"], wanted: "b" });
    expect(result.current.preset).toBe("b");
  });

  it("falls back to the first preset, and stays there when one is added above it", () => {
    const { result, rerender } = listed({ names: ["b"], wanted: "gone" });
    expect(result.current).toEqual({ preset: "b", target: "b", removed: null });

    rerender({ names: ["a", "b"], wanted: "gone" });
    expect(result.current.preset).toBe("b");
  });

  it("settles on the first preset an empty list gains", () => {
    const { result, rerender } = listed({ names: [], wanted: "" });
    expect(result.current).toEqual({ preset: "", target: "", removed: null });

    rerender({ names: ["a"], wanted: "" });
    expect(result.current.preset).toBe("a");
  });

  it("selects nothing while the settled preset is missing", () => {
    const { result, rerender } = listed({ names: ["a", "b"], wanted: "b" });

    rerender({ names: ["a"], wanted: "b" });
    expect(result.current).toEqual({ preset: "", target: "b", removed: "b" });

    rerender({ names: ["a", "b"], wanted: "b" });
    expect(result.current).toEqual({ preset: "b", target: "b", removed: null });
  });

  it("follows the next pick after a removal", () => {
    const { result, rerender } = listed({ names: ["a", "b"], wanted: "b" });
    rerender({ names: ["a"], wanted: "b" });
    rerender({ names: ["a"], wanted: "a" });

    expect(result.current).toEqual({ preset: "a", target: "a", removed: null });
  });
});
