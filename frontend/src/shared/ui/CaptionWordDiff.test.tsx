import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { diffCaptionWords } from "@/shared/lib/captionWordDiff";
import { CaptionDiffStat, CaptionDiffView, CaptionWordDiff } from "./CaptionWordDiff";

function view(before: string, after: string, layout: "inline" | "split" = "inline") {
  return render(
    <CaptionDiffView
      segments={diffCaptionWords(before, after)}
      layout={layout}
      emptySideLabel="No caption"
    />,
  ).container;
}

describe("CaptionDiffView", () => {
  it("tints only the words of a change, leaving its edge spaces unmarked", () => {
    const container = view("a small brown dog", "a brown dog");

    expect(container.querySelector("del")?.textContent).toBe("small");
    expect(container.querySelector("p")?.textContent).toBe("a small brown dog");
  });

  it("sets the second half of a flush swap apart, but not a later insertion", () => {
    const container = view("a red dog runs", "a blue dog runs fast");

    const [swapped, appended] = container.querySelectorAll("ins");
    expect(swapped).toHaveTextContent("blue");
    expect(swapped).toHaveClass("caption-diff__added--flush");
    expect(appended).toHaveTextContent("fast");
    expect(appended).not.toHaveClass("caption-diff__added--flush");
  });

  it("gives a changed line break a visible stand-in without altering the text", () => {
    const container = view("a dog\nin a field", "a dog in a field");

    const removed = container.querySelector("del");
    expect(removed?.querySelector(".caption-diff__break")).not.toBeNull();
    expect(removed?.textContent).toBe("\n");
    expect(container.querySelector("ins .caption-diff__break")).toBeNull();
  });

  it("stacks two captions that share nothing instead of interleaving them", () => {
    const container = view("a dog", "two cats");

    expect(container.querySelector("p")).toHaveClass("caption-diff--rewrite");
    expect(container.querySelector("del")).toHaveTextContent("a dog");
    expect(container.querySelector("ins")).toHaveTextContent("two cats");
  });

  it("keeps each side of a split view to its own text and changes", () => {
    const container = view("a red dog", "a blue dog", "split");

    const [before, after] = container.querySelectorAll("p");
    expect(before.textContent).toBe("a red dog");
    expect(before.querySelector("ins")).toBeNull();
    expect(after.textContent).toBe("a blue dog");
    expect(after.querySelector("del")).toBeNull();
  });

  it("labels an empty side of a split view", () => {
    const container = view("", "a dog", "split");

    const [before, after] = container.querySelectorAll("p");
    expect(before).toHaveTextContent("No caption");
    expect(after.textContent).toBe("a dog");
  });
});

describe("CaptionDiffStat", () => {
  it("counts the words each side alone has and names them in its tooltip", () => {
    render(
      <CaptionDiffStat
        segments={diffCaptionWords("a red dog", "a big blue dog")}
        addedVerb="restored"
      />,
    );

    expect(screen.getByTitle("1 word removed, 2 words restored")).toHaveTextContent("−1+2");
  });

  it("renders nothing for identical captions", () => {
    const { container } = render(<CaptionDiffStat segments={diffCaptionWords("a dog", "a dog")} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("CaptionWordDiff", () => {
  it("explains its tints and sums up the change above the text", () => {
    render(
      <CaptionWordDiff
        before="a red dog"
        after="a blue dog"
        legend={{ removed: "Only in this caption", added: "From the backup" }}
      />,
    );

    expect(screen.getByText("Only in this caption")).toBeInTheDocument();
    expect(screen.getByText("From the backup")).toBeInTheDocument();
    expect(screen.getByTitle("1 word removed, 1 word added")).toBeInTheDocument();
    expect(screen.getByText("red").tagName).toBe("DEL");
  });
});
