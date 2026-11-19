import { useRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFolderEntrance } from "./useFolderEntrance";

function Content({ folder, cards }: { folder: string; cards: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFolderEntrance(ref, folder);
  return (
    <div ref={ref} data-testid="content">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="card-cell" data-index={index} />
      ))}
    </div>
  );
}

describe("useFolderEntrance", () => {
  let animate: ReturnType<typeof vi.fn<Element["animate"]>>;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    animate = vi.fn<Element["animate"]>();
    // jsdom has no Web Animations; the entrance needs only the calls.
    Element.prototype.animate = animate;
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    // Every card sits in view.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 10,
      bottom: 100,
    } as DOMRect);
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const runFrame = () => frames.splice(0).forEach((callback) => callback(0));
  const cardDelays = () =>
    animate.mock.contexts
      .map((context, call) => [context as HTMLElement, animate.mock.calls[call][1]] as const)
      .filter(([element]) => element.classList.contains("card-cell"))
      .map(([, options]) => (options as KeyframeAnimationOptions).delay);

  it("fades the folder in and raises every card in view, staggering the first twelve", () => {
    render(<Content folder="a" cards={20} />);
    expect(animate.mock.contexts[0]).toHaveProperty("dataset.testid", "content");

    runFrame();
    expect(cardDelays()).toEqual(
      Array.from({ length: 20 }, (_, index) => Math.min(index, 11) * 18),
    );
  });

  it("leaves cards outside the view alone", () => {
    vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue({
      top: window.innerHeight + 10,
      bottom: window.innerHeight + 100,
    } as DOMRect);
    render(<Content folder="a" cards={3} />);
    runFrame();
    expect(cardDelays()).toEqual([]);
  });

  it("enters again for another folder, and not on a re-render of the same one", () => {
    const { rerender } = render(<Content folder="a" cards={1} />);
    runFrame();
    rerender(<Content folder="a" cards={2} />);
    runFrame();
    expect(animate).toHaveBeenCalledTimes(2);

    rerender(<Content folder="b" cards={2} />);
    runFrame();
    expect(animate).toHaveBeenCalledTimes(5);
  });

  it("stays still under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }) as MediaQueryList);
    render(<Content folder="a" cards={3} />);
    runFrame();
    expect(animate).not.toHaveBeenCalled();
  });
});
