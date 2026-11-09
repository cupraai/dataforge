import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaptionPreviewSample } from "./CaptionPreviewSample";

const LONG = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");

describe("CaptionPreviewSample", () => {
  it("marks every changed word of a caption, not one stretch from first to last", () => {
    render(
      <ul>
        <CaptionPreviewSample
          name="one.png"
          before="a red car by a red barn"
          after="a blue car by a blue barn"
        />
      </ul>,
    );

    const item = screen.getByRole("listitem");
    expect([...item.querySelectorAll("del")].map((mark) => mark.textContent)).toEqual([
      "red",
      "red",
    ]);
    expect(item).toHaveTextContent("car by a");
    expect(screen.getByTitle("2 words removed, 2 words added")).toBeInTheDocument();
  });

  it("trims distant unchanged text when asked to, keeping the change in view", () => {
    render(
      <ul>
        <CaptionPreviewSample
          name="one.png"
          before={`${LONG} red ${LONG}`}
          after={`${LONG} blue ${LONG}`}
          contextChars={20}
        />
      </ul>,
    );

    const text = screen.getByRole("listitem").querySelector("p")?.textContent ?? "";
    expect(text).toMatch(/^….*word39 redblue word0.*…$/);
    expect(text).not.toContain("word20");
  });

  it("shows the whole caption without a context limit", () => {
    render(
      <ul>
        <CaptionPreviewSample name="one.png" before={`${LONG} red`} after={`${LONG} blue`} />
      </ul>,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("word0 word1");
  });

  it("flags an unchanged caption and a failed one", () => {
    render(
      <ul>
        <CaptionPreviewSample name="same.png" before="a lake" after="a lake" />
        <CaptionPreviewSample name="bad.png" before="a dog" error="The model timed out." />
      </ul>,
    );

    const [same, failed] = screen.getAllByRole("listitem");
    expect(same).toHaveTextContent("Unchanged");
    expect(same).toHaveTextContent("a lake");
    expect(same.querySelector("del, ins")).toBeNull();
    expect(failed).toHaveTextContent("Failed");
    expect(failed).toHaveTextContent("The model timed out.");
  });
});
