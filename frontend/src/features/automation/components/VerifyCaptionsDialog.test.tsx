import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  emptyAutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";
import { VerifyCaptionsDialog } from "./VerifyCaptionsDialog";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import type { ComponentProps } from "react";

const DEFAULTS: JobSettingsByType["verify_captions"] =
  emptyAutomationSettings("C:/datasets/photos").verify_captions;

function renderDialog(
  overrides: Partial<JobSettingsByType["verify_captions"]> = {},
  onConfirm = vi.fn<ComponentProps<typeof VerifyCaptionsDialog>["onConfirm"]>(),
) {
  renderWithQueryClient(
    <VerifyCaptionsDialog
      scope={{ itemCount: 12, folderLabel: "Photos", kind: "folder" as const }}
      initialSettings={{ ...DEFAULTS, ...overrides }}
      onConfirm={onConfirm}
      onCancel={vi.fn<() => void>()}
    />,
  );

  return onConfirm;
}

function confirm(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Start verify captions" }));
}

describe("VerifyCaptionsDialog", () => {
  it("starts from the settings the last run used", () => {
    renderDialog({
      mode: "thinking",
      reasoning_effort: "xhigh",
      preserve_thinking: false,
      context: "Studio product shots.",
    });

    expect(screen.getByLabelText("Additional context")).toHaveValue("Studio product shots.");
    expect(screen.getByLabelText("Preserve thinking")).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Reasoning/ })).toBeChecked();
  });

  it("submits the settings it was opened with", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({
      mode: "thinking",
      reasoning_effort: "low",
      preserve_thinking: true,
      context: "Studio product shots.",
    });

    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "thinking",
      context: "Studio product shots.",
      reasoning_effort: "low",
      preserve_thinking: true,
    });
  });

  it("submits an edited context", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.type(screen.getByLabelText("Additional context"), "Outdoor portraits.");
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "thinking",
      context: "Outdoor portraits.",
      reasoning_effort: "medium",
      preserve_thinking: true,
    });
  });

  it("saves a context under a name and adds it after the typed text", async () => {
    const { requestsTo } = installMockBackend();
    const user = userEvent.setup();
    const onConfirm = renderDialog({ context: "Studio product shots." });
    const field = screen.getByLabelText("Additional context");
    const openSaved = async () => {
      await user.click(screen.getByRole("button", { name: "Saved" }));
      return screen.findByRole("dialog", { name: "Saved contexts" });
    };

    let panel = await openSaved();
    await user.click(within(panel).getByRole("button", { name: "Save current context..." }));
    await user.type(within(panel).getByLabelText("Name for the context"), "Studio{Enter}");
    expect(await within(panel).findByRole("button", { name: /^Studio/ })).toBeInTheDocument();
    expect(requestsTo("/api/preferences/snippets/verify_contexts", "PUT")).toHaveLength(1);
    // Enter in the name field saves; it must not also start the job.
    expect(onConfirm).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "Two people.");
    panel = await openSaved();
    await user.click(within(panel).getByRole("button", { name: /^Studio/ }));

    expect(field).toHaveValue("Two people.\n\nStudio product shots.");
    expect(field).toHaveFocus();
    await confirm(user);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ context: "Two people.\n\nStudio product shots." }),
    );
  });

  it("submits a cleared Preserve thinking box", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({ mode: "thinking", preserve_thinking: true, context: "" });

    await user.click(screen.getByLabelText("Preserve thinking"));
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "thinking",
      context: "",
      reasoning_effort: "medium",
      preserve_thinking: false,
    });
  });

  it("confirms without writing preferences of its own", async () => {
    // Starting the job stores these; the dialog writes nothing itself.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await confirm(user);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes("/api/preferences"))).toEqual(
      [],
    );
    fetchSpy.mockRestore();
  });
});
