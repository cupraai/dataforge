import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { iconTrash2 } from "@/shared/icons";
import { SHORTCUTS } from "@/shared/lib/shortcuts";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is named by its label and shows it as a tooltip", () => {
    vi.useFakeTimers();
    render(<IconButton icon={iconTrash2} label="Delete file" />);

    const button = screen.getByRole("button", { name: "Delete file" });
    fireEvent.mouseEnter(button.parentElement!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("Delete file");
    // The bubble repeats the name, so it is not announced a second time.
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("describes itself with a tooltip that says more than the name", () => {
    vi.useFakeTimers();
    render(<IconButton icon={iconTrash2} label="Delete clip.mp4" tooltip="Delete file" />);

    const button = screen.getByRole("button", { name: "Delete clip.mp4" });
    fireEvent.mouseEnter(button.parentElement!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(button).toHaveAccessibleDescription("Delete file");
  });

  it("renders the bare button when the tooltip is turned off", () => {
    const { container } = render(<IconButton icon={iconTrash2} label="Close" tooltip={false} />);

    expect(container.firstElementChild?.tagName).toBe("BUTTON");
  });

  it("names its shortcut and reports pressed and busy states", () => {
    render(
      <IconButton
        icon={iconTrash2}
        label="Undo stroke"
        shortcut={SHORTCUTS.fillUndoStroke}
        pressed
        busy
      />,
    );

    const button = screen.getByRole("button", { name: "Undo stroke" });
    expect(button).toHaveAttribute("aria-keyshortcuts");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("keeps a shortcut the caller names itself", () => {
    render(<IconButton icon={iconTrash2} label="Move up" aria-keyshortcuts="Alt+ArrowUp" />);

    expect(screen.getByRole("button", { name: "Move up" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+ArrowUp",
    );
  });
});
