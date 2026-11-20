import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { splitForMiddleTruncation } from "@/shared/lib/middleTruncation";
import { MiddleTruncate } from "./MiddleTruncate";

describe("splitForMiddleTruncation", () => {
  it("keeps the end of the stem and the extension whole", () => {
    expect(splitForMiddleTruncation("showcase_21065-audio.mp4")).toEqual([
      "showcase_210",
      "65-audio.mp4",
    ]);
    expect(splitForMiddleTruncation("a long name without extension")).toEqual([
      "a long name without e",
      "xtension",
    ]);
  });

  it("leaves short names whole", () => {
    expect(splitForMiddleTruncation("frame.png")).toEqual(["frame.png", ""]);
    expect(splitForMiddleTruncation("clip_0001.mp4")).toEqual(["clip_0001.mp4", ""]);
  });
});

describe("MiddleTruncate", () => {
  it("reads as the whole name", () => {
    const { container } = render(<MiddleTruncate text="showcase_21065-audio.mp4" />);
    expect(container).toHaveTextContent(/^showcase_21065-audio\.mp4$/);
    expect(container.querySelector(".middle-truncate__tail")).toHaveTextContent("65-audio.mp4");
  });
});
