import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DisclosureButton } from "@/shared/ui/Disclosure";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DisclosureButton open={open} controls="panel" label="Details" onClick={() => setOpen(!open)}>
        <span>2 failed</span>
      </DisclosureButton>
      <div id="panel" hidden={!open}>
        Body
      </div>
    </>
  );
}

describe("DisclosureButton", () => {
  it("reports and toggles the region it controls", async () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: /^Details/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "panel");
    expect(screen.queryByText("Body")).not.toBeVisible();

    await userEvent.setup().click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Body")).toBeVisible();
  });

  it("lets the caller take the button out of the tab order", () => {
    render(<DisclosureButton open controls="panel" label="Output" tabIndex={-1} />);
    expect(screen.getByRole("button", { name: "Output" })).toHaveAttribute("tabindex", "-1");
  });
});
