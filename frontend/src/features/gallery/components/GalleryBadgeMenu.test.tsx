import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { CardBadgeMode } from "@/shared/types";
import { GalleryBadgeMenu } from "./GalleryBadgeMenu";

describe("GalleryBadgeMenu", () => {
  it("marks the active mode and reports a new choice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: CardBadgeMode) => void>();

    render(<GalleryBadgeMenu value="full" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Card badges" }));

    expect(screen.getByRole("menuitemradio", { name: /Full/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: /Hidden/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await user.click(screen.getByRole("menuitemradio", { name: /Compact/ }));

    expect(onChange).toHaveBeenCalledWith("compact");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("switches modes with Ctrl+Shift+1, 2 and 3", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: CardBadgeMode) => void>();

    const { rerender } = render(<GalleryBadgeMenu value="full" onChange={onChange} />);

    await user.keyboard("{Control>}{Shift>}1{/Shift}{/Control}");
    expect(onChange).not.toHaveBeenCalled();
    // Ctrl+2 without Shift belongs to the display mode.
    await user.keyboard("{Control>}2{/Control}");
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard("{Control>}{Shift>}2{/Shift}{/Control}");
    rerender(<GalleryBadgeMenu value="compact" onChange={onChange} />);
    await user.keyboard("{Control>}{Shift>}3{/Shift}{/Control}");
    rerender(<GalleryBadgeMenu value="hidden" onChange={onChange} />);
    await user.keyboard("{Control>}{Shift>}1{/Shift}{/Control}");

    expect(onChange.mock.calls).toEqual([["compact"], ["hidden"], ["full"]]);
  });

  it("names each mode's shortcut on its menu item", async () => {
    const user = userEvent.setup();

    render(<GalleryBadgeMenu value="full" onChange={vi.fn<(value: CardBadgeMode) => void>()} />);

    await user.click(screen.getByRole("button", { name: "Card badges" }));

    expect(screen.getByRole("menuitemradio", { name: /Hidden/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+Shift+3 Meta+Shift+3",
    );
  });

  it("closes without a change when the active mode is chosen again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: CardBadgeMode) => void>();

    render(<GalleryBadgeMenu value="hidden" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Card badges" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Hidden/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
