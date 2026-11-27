import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { iconFolder } from "@/shared/icons";
import { MenuGroup, MenuItem } from "./Menu";

describe("MenuItem", () => {
  it("takes the menu role that matches its kind", () => {
    render(
      <MenuGroup label="Show">
        <MenuItem label="Open" onSelect={vi.fn<() => void>()} />
        <MenuItem kind="radio" checked label="Large" onSelect={vi.fn<() => void>()} />
        <MenuItem kind="checkbox" checked={false} label="Resize" onSelect={vi.fn<() => void>()} />
      </MenuGroup>,
    );

    expect(screen.getByRole("group", { name: "Show" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open" })).not.toHaveAttribute("aria-checked");
    expect(screen.getByRole("menuitemradio", { name: "Large" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Resize" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("wraps a tiled icon in a span and leaves a plain one bare", () => {
    render(
      <>
        <MenuItem icon={iconFolder} iconTile label="Tiled" onSelect={vi.fn<() => void>()} />
        <MenuItem icon={iconFolder} label="Plain" onSelect={vi.fn<() => void>()} />
      </>,
    );

    const tiled = screen.getByRole("menuitem", { name: "Tiled" }).querySelector(".menu__icon")!;
    const plain = screen.getByRole("menuitem", { name: "Plain" }).querySelector(".menu__icon")!;
    expect(tiled.parentElement).toHaveClass("menu__icon-tile");
    expect(plain.parentElement).toHaveRole("menuitem");
  });

  it("marks the current place and runs its action on click", async () => {
    const onSelect = vi.fn<() => void>();
    render(<MenuItem icon={iconFolder} label="Photos" current onSelect={onSelect} />);

    const item = screen.getByRole("menuitem", { name: "Photos" });
    expect(item).toHaveAttribute("aria-current", "true");
    await userEvent.setup().click(item);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
