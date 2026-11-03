import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFillControls, makeImageFill } from "@/test/fillControls";
import type { ImageFillControls } from "@/features/gallery/hooks/useImageFill";
import { stageHintSlot } from "@/test/stageHintSlot";
import { FillStatusBar } from "./FillStatusBar";

function renderBar(overrides: Partial<ImageFillControls> = {}) {
  const { slot, wrapper } = stageHintSlot();
  const view = render(<FillStatusBar fill={makeFillControls(overrides)} />, { wrapper });
  const bar = () => slot.querySelector(".stage-hint")!;
  const rerenderWith = (fill: ImageFillControls) => view.rerender(<FillStatusBar fill={fill} />);
  return { bar, rerenderWith };
}

describe("FillStatusBar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at painting, with the keys for the brush, its size and the view", () => {
    const { bar } = renderBar();

    expect(screen.getByRole("status")).toHaveTextContent("Paint over what you want to change.");
    expect(bar()).toHaveClass("stage-hint--info");
    for (const does of ["Brush", "Eraser", "Size", "Zoom", "Pan"]) {
      expect(bar()).toHaveTextContent(does);
    }
  });

  it("moves on to the instruction once something is painted", () => {
    const { bar } = renderBar({ generateBlocker: null, canGenerate: true });

    expect(screen.getByRole("status")).toHaveTextContent("leave the instruction blank to remove");
    expect(bar()).toHaveTextContent("Generate");
    expect(bar()).not.toHaveTextContent("Eraser");
  });

  it("warns with the reason Generate is off when it is not the empty selection", () => {
    const { bar } = renderBar({ generateBlocker: "Update ComfyUI for Qwen-Image 2.1." });

    expect(screen.getByRole("status")).toHaveTextContent("Update ComfyUI for Qwen-Image 2.1.");
    expect(bar()).toHaveClass("stage-hint--warning");
  });

  it("counts the seconds of a run without reading each one out", () => {
    vi.useFakeTimers();
    const { bar } = renderBar({ generating: true, progress: "running", canPaint: false });

    expect(screen.getByRole("status")).toHaveTextContent("Generating...");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const elapsed = bar().querySelector(".stage-hint__elapsed");
    expect(elapsed).toHaveTextContent("3 s");
    expect(elapsed).toHaveAttribute("aria-hidden", "true");
  });

  it("starts the count again for the next run", () => {
    vi.useFakeTimers();
    const running = { generating: true, progress: "running" as const, canPaint: false };
    const { bar, rerenderWith } = renderBar(running);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    rerenderWith(makeFillControls());
    rerenderWith(makeFillControls(running));

    expect(bar().querySelector(".stage-hint__elapsed")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(bar().querySelector(".stage-hint__elapsed")).toHaveTextContent("1 s");
  });

  it("asks for a decision on a result, and says how to compare", () => {
    const { bar } = renderBar({ candidate: makeImageFill(), canPaint: false });

    expect(screen.getByRole("status")).toHaveTextContent("Hold the picture");
    expect(bar()).toHaveClass("stage-hint--done");
  });

  it("puts a failure ahead of everything but a run", () => {
    const { bar } = renderBar({ error: "ComfyUI ran out of memory.", generateBlocker: null });

    expect(screen.getByRole("status")).toHaveTextContent("ComfyUI ran out of memory.");
    expect(bar()).toHaveClass("stage-hint--error");
  });

  it("says a result can no longer be kept once the fills under it changed", () => {
    renderBar({ candidate: makeImageFill(), candidateStale: true });

    expect(screen.getByRole("status")).toHaveTextContent("generate again");
  });
});
