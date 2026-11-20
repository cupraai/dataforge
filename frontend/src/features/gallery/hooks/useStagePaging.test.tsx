import { useRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { pagingDirection, useStagePaging } from "./useStagePaging";

function Stage({
  path,
  index,
  enabled = true,
}: {
  path: string;
  index: number;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useStagePaging(ref, path, index, 5, enabled);
  return (
    <div ref={ref}>
      <button type="button" className="gallery-item-dialog__nav" />
      <div className="media" />
      <button type="button" className="gallery-item-dialog__nav" />
    </div>
  );
}

describe("pagingDirection", () => {
  it("follows the index, and keeps going forward or back over the ends", () => {
    expect(pagingDirection(1, 2, 5)).toBe(1);
    expect(pagingDirection(2, 1, 5)).toBe(-1);
    expect(pagingDirection(4, 0, 5)).toBe(1);
    expect(pagingDirection(0, 4, 5)).toBe(-1);
    // Two items: each step is plainly forward or back.
    expect(pagingDirection(1, 0, 2)).toBe(-1);
  });
});

describe("useStagePaging", () => {
  let animate: ReturnType<typeof vi.fn<Element["animate"]>>;

  beforeEach(() => {
    animate = vi.fn<Element["animate"]>();
    // jsdom has no Web Animations; the slide needs only the calls.
    Element.prototype.animate = animate;
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    vi.unstubAllGlobals();
  });

  const travel = () =>
    animate.mock.calls.map(([keyframes]) => (keyframes as Keyframe[])[0].transform);

  it("slides the media, not the nav buttons, in from the side paged toward", () => {
    const { rerender } = render(<Stage path="a.png" index={1} />);
    expect(animate).not.toHaveBeenCalled();

    rerender(<Stage path="b.png" index={2} />);
    expect(animate.mock.contexts).toEqual([expect.objectContaining({ className: "media" })]);
    expect(travel()).toEqual(["translateX(1.25rem)"]);

    rerender(<Stage path="a.png" index={1} />);
    expect(travel()).toEqual(["translateX(1.25rem)", "translateX(-1.25rem)"]);
  });

  it("stays still on a re-render, while disabled and under reduced motion", () => {
    const { rerender } = render(<Stage path="a.png" index={1} />);
    rerender(<Stage path="a.png" index={1} />);
    rerender(<Stage path="b.png" index={2} enabled={false} />);
    vi.stubGlobal("matchMedia", () => ({ matches: true }) as MediaQueryList);
    rerender(<Stage path="c.png" index={3} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
