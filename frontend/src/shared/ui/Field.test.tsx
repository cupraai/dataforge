import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { Field, FieldGroup, TextInput } from "./Field";
import { SearchInput } from "./SearchInput";

describe("Field", () => {
  it("labels its control and describes it with the hint", () => {
    render(
      <Field label="Folder name" hint="Letters and digits only.">
        {(control) => <TextInput {...control} />}
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Folder name" });
    expect(input).toHaveAccessibleDescription("Letters and digits only.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and says why in place of the hint", () => {
    render(
      <Field label="Width" hint="In pixels." error="Must be a whole number.">
        {(control) => <TextInput {...control} />}
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Width" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Must be a whole number.");
    expect(screen.queryByText("In pixels.")).not.toBeInTheDocument();
  });

  it("keeps the control's name to the label when something sits beside it", () => {
    render(
      <Field label="Instruction" labelEnd={<button type="button">Snippets</button>}>
        {(control) => <TextInput {...control} />}
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: "Instruction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Snippets" })).toBeInTheDocument();
  });

  it("names a group of controls with its legend", () => {
    render(
      <FieldGroup label="Settings">
        <input type="checkbox" aria-label="Opacity" />
      </FieldGroup>,
    );

    expect(screen.getByRole("group", { name: "Settings" })).toBeInTheDocument();
  });
});

describe("SearchInput", () => {
  function Harness() {
    const [value, setValue] = useState("");
    return <SearchInput label="Search fonts" value={value} onChange={setValue} />;
  }

  it("offers a clear button only while it holds text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("searchbox", { name: "Search fonts" });
    expect(screen.queryByRole("button", { name: "Clear the search" })).not.toBeInTheDocument();

    await user.type(field, "sans");
    await user.click(screen.getByRole("button", { name: "Clear the search" }));

    expect(field).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear the search" })).not.toBeInTheDocument();
  });
});
