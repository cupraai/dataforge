import { instructionFile } from "@/test/instructionFixtures";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstructionKind } from "@/shared/api/folderInstructions";
import { HOME_PATH } from "@/test/fixtures";
import type { FolderInstructionsResponse, InstructionFileResponse } from "@/shared/types";
import { FolderInstructionsDialog } from "./FolderInstructionsDialog";
import { renderWithQueryClient } from "@/test/queryClient";

const fetchFolderInstructions = vi.fn<(...args: unknown[]) => unknown>();
const saveInstructionFile = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/shared/api/folderInstructions", () => ({
  fetchFolderInstructions: (...args: unknown[]) => fetchFolderInstructions(...args),
  saveInstructionFile: (...args: unknown[]) => saveInstructionFile(...args),
}));

const PROMPT = "Caption every image with rich detail";
const TEMPLATE = "words:\n  min: 8\n";
const PARENT = "C:\\datasets";

const NO_FILE = instructionFile();

const LABELS: Record<InstructionKind, string> = {
  sysprompt: "System prompt",
  caption_rules: "Caption rules",
};

function file(overrides: Partial<InstructionFileResponse> = {}): InstructionFileResponse {
  return instructionFile(overrides);
}

function own(text: string): InstructionFileResponse {
  return file({ text, has_file: true });
}

function inherited(kind: InstructionKind, text: string): InstructionFileResponse {
  const filename = kind === "sysprompt" ? ".sysprompt" : ".captionrules";
  return file({
    parent_folder: PARENT,
    parent_relative_path: `..\\${filename}`,
    parent_text: text,
    state: {
      origin: "inherited",
      status: "ready",
      source_path: `${PARENT}\\${filename}`,
      relative_path: `..\\${filename}`,
      text,
      message: null,
    },
  });
}

function instructions(
  files: Partial<Record<InstructionKind, InstructionFileResponse>> = {},
): FolderInstructionsResponse {
  return {
    sysprompt: files.sysprompt ?? own(PROMPT),
    caption_rules: files.caption_rules ?? own(""),
    caption_rules_template: TEMPLATE,
  };
}

function renderDialog(
  overrides: {
    initialTab?: InstructionKind;
    onClose?: () => void;
    onSaved?: (kind: InstructionKind, saved: InstructionFileResponse) => void;
  } = {},
) {
  return renderWithQueryClient(
    <FolderInstructionsDialog
      folderPath={HOME_PATH}
      initialTab={overrides.initialTab}
      onClose={overrides.onClose ?? vi.fn<() => void>()}
      onSaved={
        overrides.onSaved ??
        vi.fn<(kind: InstructionKind, saved: InstructionFileResponse) => void>()
      }
    />,
  );
}

function editor(kind: InstructionKind) {
  return screen.findByRole("textbox", { name: LABELS[kind] });
}

function closeButton() {
  const dialog = screen.getByRole("dialog", { name: "Folder instructions" });
  return within(dialog).getByRole("button", { name: "Close" });
}

describe("FolderInstructionsDialog", () => {
  beforeEach(() => {
    fetchFolderInstructions.mockReset();
    saveInstructionFile.mockReset();
    fetchFolderInstructions.mockResolvedValue(instructions());
    saveInstructionFile.mockImplementation(async (_kind, _folder, text) =>
      own(`${String(text).trim()}\n`),
    );
  });

  it("locks a file while a job that reads it is queued or running", async () => {
    fetchFolderInstructions.mockResolvedValue(
      instructions({ sysprompt: file({ ...own(PROMPT), locked_by_job_id: "job-1" }) }),
    );
    renderDialog();

    expect(await editor("sysprompt")).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Caption rules" }));
    expect(await editor("caption_rules")).toBeEnabled();
    expect(screen.getByText(/Locked while/)).toHaveTextContent("Locked while Auto-caption runs");
  });

  it("reports the prompt in estimated tokens only", async () => {
    renderDialog();
    await editor("sysprompt");

    const stats = screen.getByLabelText("Prompt statistics");
    // 36 characters over 6 words, so the character rule sets the estimate.
    expect(stats).toHaveTextContent("~9 tokens");
    expect(stats).not.toHaveTextContent("characters");
    expect(fetchFolderInstructions).toHaveBeenCalledWith(HOME_PATH, expect.anything());
    expect(screen.getByRole("button", { name: "Heading 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heading 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heading 3" })).toBeInTheDocument();
  });

  it("reports the rules in lines only", async () => {
    fetchFolderInstructions.mockResolvedValue(instructions({ caption_rules: own(TEMPLATE) }));
    renderDialog({ initialTab: "caption_rules" });
    await editor("caption_rules");

    const stats = screen.getByLabelText("Rule statistics");
    expect(stats).toHaveTextContent("2 lines");
    expect(stats).not.toHaveTextContent("characters");
  });

  it("saves only when asked, then closes", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(kind: InstructionKind, saved: InstructionFileResponse) => void>();
    const onClose = vi.fn<() => void>();
    renderDialog({ onSaved, onClose });

    await user.type(await editor("sysprompt"), " more");
    expect(saveInstructionFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(saveInstructionFile).toHaveBeenCalledWith("sysprompt", HOME_PATH, `${PROMPT} more`);
    expect(onSaved).toHaveBeenCalledWith("sysprompt", own(`${PROMPT} more\n`));
  });

  it("keeps Save and Reset inert until something changes", async () => {
    const user = userEvent.setup();
    renderDialog();
    const prompt = await editor("sysprompt");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();

    await user.type(prompt, "!");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("restores the saved text on Reset", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(await editor("sysprompt"), " and then some");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(await editor("sysprompt")).toHaveValue(PROMPT);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("closes straight away when nothing was edited", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });
    await editor("sysprompt");

    await user.click(closeButton());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks before throwing away edits", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    await user.type(await editor("sysprompt"), " edited");
    await user.click(closeButton());
    const confirm = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    expect(confirm).toHaveTextContent("system prompt");

    await user.click(within(confirm).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await editor("sysprompt")).toHaveValue(`${PROMPT} edited`);

    await user.click(closeButton());
    const reopened = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await user.click(within(reopened).getByRole("button", { name: "Discard" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveInstructionFile).not.toHaveBeenCalled();
  });

  it("routes Escape through the same discard confirm", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });
    const prompt = await editor("sysprompt");

    await user.type(prompt, " edited");
    fireEvent.keyDown(prompt, { key: "Escape" });

    expect(
      await screen.findByRole("alertdialog", { name: "Discard changes?" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns to the edited draft when Escape dismisses the discard confirmation", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    await user.type(await editor("sysprompt"), " edited");
    await user.click(closeButton());
    await screen.findByRole("alertdialog", { name: "Discard changes?" });
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await editor("sysprompt")).toHaveValue(`${PROMPT} edited`);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the draft on screen when the save fails", async () => {
    const user = userEvent.setup();
    saveInstructionFile.mockRejectedValue(new Error("disk is read-only"));
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    await user.type(await editor("sysprompt"), " edited");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk is read-only");
    expect(onClose).not.toHaveBeenCalled();
    expect(await editor("sysprompt")).toHaveValue(`${PROMPT} edited`);

    await user.type(await editor("sysprompt"), "!");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports folder instructions that could not be loaded", async () => {
    fetchFolderInstructions.mockRejectedValue(new Error("Failed to read .sysprompt"));
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to read .sysprompt");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  describe("tabs", () => {
    it("shows each file behind its own tab", async () => {
      const user = userEvent.setup();
      fetchFolderInstructions.mockResolvedValue(
        instructions({ caption_rules: own("repeated_phrases: 4\n") }),
      );
      renderDialog();

      expect(screen.getByRole("tab", { name: "System prompt" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await user.click(screen.getByRole("tab", { name: "Caption rules" }));

      expect(await editor("caption_rules")).toHaveValue("repeated_phrases: 4\n");
      expect(screen.queryByRole("textbox", { name: "System prompt" })).not.toBeInTheDocument();
    });

    it("opens on the requested tab", async () => {
      renderDialog({ initialTab: "caption_rules" });

      expect(screen.getByRole("tab", { name: "Caption rules" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(await editor("caption_rules")).toHaveValue("");
    });

    it("moves between tabs with the arrow keys", async () => {
      const user = userEvent.setup();
      renderDialog();

      screen.getByRole("tab", { name: "System prompt" }).focus();
      await user.keyboard("{ArrowRight}");

      const rulesTab = screen.getByRole("tab", { name: "Caption rules" });
      expect(rulesTab).toHaveFocus();
      expect(rulesTab).toHaveAttribute("aria-selected", "true");
    });

    it("keeps the folder path and shows help for the selected tab", async () => {
      const user = userEvent.setup();
      renderDialog();

      const dialog = screen.getByRole("dialog", { name: "Folder instructions" });
      const heading = within(dialog).getByRole("heading", { name: "Folder instructions" });
      const explanation = heading.nextElementSibling?.textContent;
      expect(explanation).toBe(HOME_PATH);
      expect(await screen.findByText(/Used by Auto-caption/)).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Caption rules" }));
      await editor("caption_rules");

      expect(heading.nextElementSibling?.textContent).toBe(explanation);
      expect(screen.getByText(/Used by Lint captions/)).toBeInTheDocument();
    });
  });

  describe.each(["sysprompt", "caption_rules"] as const)("the %s file", (kind) => {
    it("shows the inherited content read-only without making a local draft", async () => {
      fetchFolderInstructions.mockResolvedValue(
        instructions({ [kind]: inherited(kind, "From the parent.\n") }),
      );
      renderDialog({ initialTab: kind });

      expect(await editor(kind)).toHaveValue("From the parent.\n");
      expect(await editor(kind)).toBeDisabled();
      const path = screen.getByText(/^\.\.\\\./);
      expect(path).toHaveAttribute(
        "title",
        `${PARENT}\\${kind === "sysprompt" ? ".sysprompt" : ".captionrules"}`,
      );
      expect(path.parentElement).toHaveTextContent("Inherited");
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("copies a parent's file into a new file of the folder's own", async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn<(kind: InstructionKind, saved: InstructionFileResponse) => void>();
      fetchFolderInstructions.mockResolvedValue(
        instructions({ [kind]: inherited(kind, "From the parent.\n") }),
      );
      renderDialog({ initialTab: kind, onSaved });
      await editor(kind);

      await user.click(screen.getByRole("button", { name: "Customize for this folder" }));
      expect(await editor(kind)).toHaveValue("From the parent.\n");
      expect(await editor(kind)).toBeEnabled();
      expect(saveInstructionFile).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(saveInstructionFile).toHaveBeenCalledWith(kind, HOME_PATH, "From the parent.\n"),
      );
      expect(onSaved).toHaveBeenCalledWith(kind, own("From the parent.\n"));
    });

    it("says when the folder's own file replaces a parent's", async () => {
      fetchFolderInstructions.mockResolvedValue(
        instructions({
          [kind]: file({
            text: "Own.\n",
            has_file: true,
            parent_folder: PARENT,
            parent_relative_path: `..\\${kind === "sysprompt" ? ".sysprompt" : ".captionrules"}`,
            parent_text: "From the parent.\n",
          }),
        }),
      );
      renderDialog({ initialTab: kind });

      expect(await editor(kind)).toHaveValue("Own.\n");
      expect(screen.getByText(/^\.\.\\\./).parentElement).toHaveTextContent(/Replaces/);
    });

    it("sends blank text so the backend removes the file", async () => {
      const user = userEvent.setup();
      fetchFolderInstructions.mockResolvedValue(instructions({ [kind]: own("Own.\n") }));
      renderDialog({ initialTab: kind });

      await user.clear(await editor(kind));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(saveInstructionFile).toHaveBeenCalledWith(kind, HOME_PATH, ""));
    });
  });

  it("offers the template only for caption rules with nothing to inherit", async () => {
    const user = userEvent.setup();
    fetchFolderInstructions.mockResolvedValue(
      instructions({ sysprompt: NO_FILE, caption_rules: NO_FILE }),
    );
    renderDialog();

    expect(await screen.findByText("No system prompt yet")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "System prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use template" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Caption rules" }));
    await user.click(await screen.findByRole("button", { name: "Use template" }));

    expect(await editor("caption_rules")).toHaveValue(TEMPLATE);
    expect(screen.queryByRole("button", { name: "Use template" })).not.toBeInTheDocument();
  });

  it("saves the rules before the prompt when both changed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    await user.type(await editor("sysprompt"), " more");
    await user.click(screen.getByRole("tab", { name: "Caption rules" }));
    await user.type(await editor("caption_rules"), "trigger: x");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(saveInstructionFile.mock.calls.map(([kind]) => kind)).toEqual([
      "caption_rules",
      "sysprompt",
    ]);
  });

  it("creates a missing prompt only after the user writes and saves", async () => {
    const user = userEvent.setup();
    fetchFolderInstructions.mockResolvedValue(instructions({ sysprompt: NO_FILE }));
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Create instructions" }));
    await user.type(await editor("sysprompt"), "Describe the subject.");
    expect(saveInstructionFile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveInstructionFile).toHaveBeenCalledWith(
        "sysprompt",
        HOME_PATH,
        "Describe the subject.",
      ),
    );
  });

  it("resets a customized draft to the inherited read-only preview", async () => {
    const user = userEvent.setup();
    fetchFolderInstructions.mockResolvedValue(
      instructions({ sysprompt: inherited("sysprompt", "Inherited prompt.") }),
    );
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Customize for this folder" }));
    await user.type(await editor("sysprompt"), " Edited.");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await editor("sysprompt")).toHaveValue("Inherited prompt.");
    expect(await editor("sysprompt")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("previews inheritance when removing even an empty local override", async () => {
    const user = userEvent.setup();
    fetchFolderInstructions.mockResolvedValue(
      instructions({
        sysprompt: file({
          has_file: true,
          text: "",
          parent_folder: PARENT,
          parent_relative_path: "..\\.sysprompt",
          parent_text: "Inherited prompt.",
        }),
      }),
    );
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Use inherited instructions" }));
    expect(await editor("sysprompt")).toHaveValue("Inherited prompt.");
    expect(await editor("sysprompt")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveInstructionFile).toHaveBeenCalledWith("sysprompt", HOME_PATH, ""),
    );
  });

  it("lets a local prompt be cleared and rewritten without switching to the parent preview", async () => {
    const user = userEvent.setup();
    fetchFolderInstructions.mockResolvedValue(
      instructions({
        sysprompt: file({
          has_file: true,
          text: "# Local instructions",
          parent_folder: PARENT,
          parent_relative_path: "..\\.sysprompt",
          parent_text: "# Parent instructions",
        }),
      }),
    );
    renderDialog();
    await user.clear(await editor("sysprompt"));
    expect(await editor("sysprompt")).toBeEnabled();
    await user.type(await editor("sysprompt"), "# Replacement instructions");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveInstructionFile).toHaveBeenCalledWith(
        "sysprompt",
        HOME_PATH,
        "# Replacement instructions",
      ),
    );
  });

  it("shows invalid inherited rules and keeps their text available for repair", async () => {
    const user = userEvent.setup();
    const rules = inherited("caption_rules", "unknown: value");
    rules.state = { ...rules.state, status: "invalid", message: "unknown: unknown setting" };
    fetchFolderInstructions.mockResolvedValue(instructions({ caption_rules: rules }));
    renderDialog({ initialTab: "caption_rules" });
    expect(await screen.findByRole("alert")).toHaveTextContent("unknown setting");
    expect(await editor("caption_rules")).toHaveValue("unknown: value");
    await user.click(screen.getByRole("button", { name: "Customize for this folder" }));
    expect(await editor("caption_rules")).toBeEnabled();
  });

  it("requires an explicit replacement before editing an unreadable local file", async () => {
    const user = userEvent.setup();
    const prompt = own("");
    prompt.state = { ...prompt.state, status: "unreadable", message: "Could not read this file." };
    fetchFolderInstructions.mockResolvedValue(instructions({ sysprompt: prompt }));
    renderDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read");
    expect(await editor("sysprompt")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Replace unreadable file" }));
    expect(await editor("sysprompt")).toBeEnabled();
    expect(saveInstructionFile).not.toHaveBeenCalled();
  });

  it("stays on the rules tab and keeps the prompt unsaved when the rules are refused", async () => {
    const user = userEvent.setup();
    saveInstructionFile.mockRejectedValue(new Error("colour: unknown setting"));
    const onClose = vi.fn<() => void>();
    renderDialog({ onClose });

    await user.type(await editor("sysprompt"), " more");
    await user.click(screen.getByRole("tab", { name: "Caption rules" }));
    await user.type(await editor("caption_rules"), "colour: blue");
    await user.click(screen.getByRole("tab", { name: "System prompt" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("colour: unknown setting");
    expect(screen.getByRole("tab", { name: "Caption rules" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(saveInstructionFile).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
