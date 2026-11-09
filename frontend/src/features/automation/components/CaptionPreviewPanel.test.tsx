import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaptionPreviewPanel } from "./CaptionPreviewPanel";

const LONG = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");

describe("CaptionPreviewPanel", () => {
  it("lists each sample with long unchanged text trimmed, then the files it leaves out", () => {
    render(
      <CaptionPreviewPanel
        summary="3 of 5 captions would change."
        samples={[
          { name: "one.png", before: `${LONG} red ${LONG}`, after: `${LONG} blue ${LONG}` },
        ]}
        more={2}
      />,
    );

    const panel = screen.getByRole("status");
    expect(panel).toHaveTextContent("3 of 5 captions would change.");
    const [sample, more] = within(panel).getAllByRole("listitem");
    expect(sample).toHaveTextContent("one.png");
    expect(sample).not.toHaveTextContent("word20");
    expect(more).toHaveTextContent("and 2 more");
  });

  it("marks a pending request busy and an error as one", () => {
    const { rerender } = render(<CaptionPreviewPanel summary="Loading" pending />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");

    rerender(<CaptionPreviewPanel summary="Model unavailable." error />);
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("status")).toHaveClass("caption-preview--error");
    expect(screen.queryByRole("list")).toBeNull();
  });
});
