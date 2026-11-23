import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ComfySourceKind, GalleryItem } from "@/shared/types";
import { mediaItem } from "@/test/fixtures";
import { StartFilePicker } from "./StartFilePicker";

const FOLDER = "C:\\renders";

/** The oldest first, as a folder sorted by name lists them. */
const IMAGES = ["a", "b", "c", "d", "e", "f"].map((name, index) =>
  mediaItem(`${name}.png`, FOLDER, {
    modified_at: `2026-03-0${index + 1}T10:00:00Z`,
    size: 100,
    width: 640,
    height: 480,
  }),
);
const CLIP = mediaItem("clip.mp4", FOLDER, { duration: 65 });

function renderPicker(
  options: { items?: GalleryItem[]; kind?: ComfySourceKind; value?: string | null } = {},
) {
  const { items = [...IMAGES, CLIP], kind = "image", value: initial = null } = options;
  const onChange = vi.fn<(path: string | null) => void>();
  function Host() {
    const [value, setValue] = useState(initial);
    return (
      <StartFilePicker
        kind={kind}
        value={value}
        items={items}
        disabled={false}
        onChange={(path) => {
          onChange(path);
          setValue(path);
        }}
      />
    );
  }
  render(<Host />);
  return { onChange, user: userEvent.setup() };
}

function tiles(): string[] {
  return screen.getAllByRole("option").map((tile) => tile.getAttribute("aria-label") ?? "");
}

describe("StartFilePicker", () => {
  it("shows every image of the folder as a thumbnail, newest first", async () => {
    const { user } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Start image: none" }));

    expect(tiles()).toEqual(["f.png", "e.png", "d.png", "c.png", "b.png", "a.png"]);
    expect(screen.getByText("6 images")).toBeInTheDocument();
    const thumbnail = screen.getByRole("option", { name: "f.png" }).querySelector("img");
    expect(thumbnail?.getAttribute("src")).toContain(encodeURIComponent(`${FOLDER}\\f.png`));
  });

  it("picks the clicked image and names its size", async () => {
    const { user, onChange } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Start image: none" }));
    await user.click(screen.getByRole("option", { name: "c.png" }));

    expect(onChange).toHaveBeenLastCalledWith(`${FOLDER}\\c.png`);
    const trigger = screen.getByRole("button", { name: "Start image: c.png" });
    expect(trigger).toHaveFocus();
    expect(within(trigger).getByText("640 × 480")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole("option", { name: "c.png" })).toHaveAttribute("aria-selected", "true");
  });

  it("moves through the grid from the search field", async () => {
    const { user, onChange } = renderPicker();
    await user.click(screen.getByRole("button", { name: "Start image: none" }));
    const search = screen.getByRole("searchbox", { name: "Search images" });
    const active = () =>
      document
        .getElementById(search.getAttribute("aria-activedescendant") ?? "")
        ?.getAttribute("aria-label");

    expect(search).toHaveFocus();
    expect(active()).toBe("f.png");
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(active()).toBe("a.png");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("a.png");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(active()).toBe("e.png");

    // The second row is short, so a column past its end lands on its last file.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(`${FOLDER}\\a.png`);
  });

  it("narrows by name and picks the first match with Enter", async () => {
    const { user, onChange } = renderPicker();
    await user.click(screen.getByRole("button", { name: "Start image: none" }));

    await user.keyboard("nothing");
    expect(screen.getByText("No images match.")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();

    await user.clear(screen.getByRole("searchbox", { name: "Search images" }));
    await user.keyboard("B.p");
    expect(tiles()).toEqual(["b.png"]);
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(`${FOLDER}\\b.png`);
  });

  it("closes on Escape without closing what holds it", async () => {
    const outer = vi.fn<() => void>();
    const items = IMAGES;
    render(
      <div role="presentation" onKeyDown={outer}>
        <StartFilePicker
          kind="image"
          value={null}
          items={items}
          disabled={false}
          onChange={vi.fn<() => void>()}
        />
      </div>,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Start image: none" });
    await user.click(trigger);
    outer.mockClear();

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(outer).not.toHaveBeenCalled();
  });

  it("offers only clips to a preset that starts from a video", async () => {
    const { user } = renderPicker({ kind: "video" });

    await user.click(screen.getByRole("button", { name: "Start video: none" }));

    expect(tiles()).toEqual(["clip.mp4"]);
    expect(screen.getByText("1 video")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("says so when the folder has nothing to offer", async () => {
    const { user } = renderPicker({ items: [CLIP] });

    await user.click(screen.getByRole("button", { name: "Start image: none" }));

    expect(screen.getByText("This folder has no images.")).toBeInTheDocument();
  });

  it("names the folder of a file chosen elsewhere, and removes it", async () => {
    const { user, onChange } = renderPicker({ value: "C:\\portraits\\hero.png" });

    expect(
      within(screen.getByRole("button", { name: "Start image: hero.png" })).getByText(
        "In portraits",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove start image" }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Start image: none" })).toHaveFocus();
  });
});
