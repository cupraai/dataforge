import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { iconPlus } from "@/shared/icons";
import { Button } from "./Button";

describe("Button", () => {
  it("is a plain button named by its label", async () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button icon={iconPlus} onClick={onClick}>
        Add prompt
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Add prompt" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables itself and swaps in the busy label while busy", () => {
    render(
      <Button icon={iconPlus} busy busyLabel="Saving...">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector(".app-icon--spin")).not.toBeNull();
  });

  it("reports a toggle's state", () => {
    render(<Button pressed>This folder</Button>);

    expect(screen.getByRole("button", { name: "This folder" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps ARIA state the caller sets itself", () => {
    render(<Button aria-pressed>Before</Button>);

    expect(screen.getByRole("button", { name: "Before" })).toHaveAttribute("aria-pressed", "true");
  });
});
