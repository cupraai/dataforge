import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyAutomationSettings } from "@/features/automation/preferences/automationPreferences";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { EditCaptionsDialog } from "./EditCaptionsDialog";
import { appendInstruction } from "@/features/automation/lib/appendInstruction";

let requestsTo: ReturnType<typeof installMockBackend>["requestsTo"];

function renderDialog(instruction = "") {
  const onCancel = vi.fn<() => void>();
  const onConfirm = vi.fn<ComponentProps<typeof EditCaptionsDialog>["onConfirm"]>();
  renderWithQueryClient(
    <EditCaptionsDialog
      scope={{ itemCount: 4, folderLabel: "Photos", kind: "folder" as const }}
      initialSettings={{
        ...emptyAutomationSettings("C:/datasets/photos").edit_captions,
        instruction,
      }}
      folderPath="C:/datasets/photos"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onCancel, onConfirm };
}

function instructionField() {
  return screen.getByLabelText<HTMLTextAreaElement>("Edit instruction");
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Saved" }));
  return screen.findByRole("dialog", { name: "Saved instructions" });
}

describe("appendInstruction", () => {
  it("fills an empty field and appends after a blank line otherwise", () => {
    expect(appendInstruction("  \n", "Use present tense.")).toBe("Use present tense.");
    expect(appendInstruction("Name colors.\n", "Use present tense.")).toBe(
      "Name colors.\n\nUse present tense.",
    );
  });
});

const EMPTY = "Save an instruction to reuse it here, in any folder.";

async function saveAs(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, name: string) {
  await user.click(within(panel).getByRole("button", { name: "Save current instruction..." }));
  await user.type(within(panel).getByLabelText("Name for the instruction"), `${name}{Enter}`);
}

describe("InstructionSnippetMenu", () => {
  beforeEach(() => {
    ({ requestsTo } = installMockBackend());
  });

  it("saves the typed instruction under a name, then inserts it after other text", async () => {
    const user = userEvent.setup();
    renderDialog("  Use present tense.  ");

    let panel = await openPanel(user);
    expect(await within(panel).findByText(EMPTY)).toBeInTheDocument();
    await saveAs(user, panel, "Tense");

    expect(await within(panel).findByRole("button", { name: /^Tense/ })).toBeInTheDocument();
    expect(requestsTo("/api/preferences/instruction-snippets", "PUT")).toHaveLength(1);
    // Saved, the row goes back to its menu item.
    expect(within(panel).queryByLabelText("Name for the instruction")).not.toBeInTheDocument();
    // Enter in the name field saves; it must not also start the job.
    expect(screen.getByRole("dialog", { name: "Start edit captions?" })).toBeInTheDocument();

    await user.clear(instructionField());
    await user.type(instructionField(), "Name colors.");
    panel = await openPanel(user);
    await user.click(within(panel).getByRole("button", { name: /^Tense/ }));

    expect(instructionField()).toHaveValue("Name colors.\n\nUse present tense.");
    expect(instructionField()).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Saved instructions" })).not.toBeInTheDocument();
  });

  it("offers Replace for a name that is already saved, ignoring case", async () => {
    const user = userEvent.setup();
    renderDialog("first");
    const panel = await openPanel(user);
    await saveAs(user, panel, "Tense");
    await within(panel).findByRole("button", { name: /^Tense/ });

    await user.click(within(panel).getByRole("button", { name: "Save current instruction..." }));
    await user.type(within(panel).getByLabelText("Name for the instruction"), "tense");

    await user.click(within(panel).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(within(panel).getAllByRole("listitem")).toHaveLength(1));
    expect(within(panel).getByRole("button", { name: /^tense/ })).toBeInTheDocument();
  });

  it("deletes a saved instruction", async () => {
    const user = userEvent.setup();
    renderDialog("Use present tense.");
    const panel = await openPanel(user);
    await saveAs(user, panel, "Tense");

    await user.click(await within(panel).findByRole("button", { name: 'Delete "Tense"' }));

    expect(await within(panel).findByText(EMPTY)).toBeInTheDocument();
    expect(requestsTo("/api/preferences/instruction-snippets?name=Tense", "DELETE")).toHaveLength(
      1,
    );
  });

  it("cannot save without an instruction to save", async () => {
    const user = userEvent.setup();
    renderDialog("");
    const panel = await openPanel(user);

    expect(
      within(panel).getByRole("button", { name: "Save current instruction..." }),
    ).toBeDisabled();
  });

  it("Escape leaves naming first, then closes only the panel", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog("x");
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole("button", { name: "Save current instruction..." }));

    await user.keyboard("{Escape}");
    expect(within(panel).queryByLabelText("Name for the instruction")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Saved instructions" })).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
