import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("is named by its label and described by its hint", () => {
    render(
      <Checkbox
        label="Overwrite captions"
        hint="Replaces what is there."
        checked
        onChange={vi.fn<(checked: boolean) => void>()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Overwrite captions" });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription("Replaces what is there.");
  });

  it("reports the new state when the label is clicked", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    render(<Checkbox label="Send media" checked={false} onChange={onChange} />);

    await userEvent.setup().click(screen.getByText("Send media"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("ignores clicks while disabled", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    render(<Checkbox label="Send media" checked={false} disabled onChange={onChange} />);

    await userEvent.setup().click(screen.getByText("Send media"));

    expect(screen.getByRole("checkbox", { name: "Send media" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
