import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  emptyAutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";
import { VerifyCaptionsDialog } from "./VerifyCaptionsDialog";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { HOME_PATH } from "@/test/fixtures";
import type { VisionLlmState } from "@/features/automation/hooks/useVisionLlmInfo";
import type { ComponentProps } from "react";

const visionLlm = vi.hoisted(() => ({
  state: {
    ready: true,
    info: null,
    unreachable: false,
    service: "ready",
    issue: null,
  } as VisionLlmState,
}));

vi.mock("@/features/automation/hooks/useVisionLlmInfo", () => ({
  useVisionLlmInfo: () => visionLlm.state,
}));

beforeEach(() => {
  visionLlm.state = { ready: true, info: null, unreachable: false, service: "ready", issue: null };
});

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
      folderPath="C:/datasets/photos"
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
  it("cannot start without the vision server, but saves a workflow step", () => {
    visionLlm.state = {
      ready: true,
      info: null,
      unreachable: true,
      service: "offline",
      issue: null,
    };
    const scope = { itemCount: 12, folderLabel: "Photos", kind: "folder" as const };
    const { rerender } = renderWithQueryClient(
      <VerifyCaptionsDialog
        scope={scope}
        initialSettings={DEFAULTS}
        folderPath="C:/datasets/photos"
        onConfirm={vi.fn<ComponentProps<typeof VerifyCaptionsDialog>["onConfirm"]>()}
        onCancel={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Vision server offline");
    expect(screen.getByRole("button", { name: "Start verify captions" })).toBeDisabled();

    rerender(
      <VerifyCaptionsDialog
        scope={scope}
        initialSettings={DEFAULTS}
        folderPath="C:/datasets/photos"
        editingStep
        confirmLabel="Save step"
        onConfirm={vi.fn<ComponentProps<typeof VerifyCaptionsDialog>["onConfirm"]>()}
        onCancel={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save step" })).toBeEnabled();
  });

  it("starts from the settings the last run used", () => {
    renderDialog({
      mode: "thinking",
      reasoning_effort: "xhigh",
      preserve_thinking: false,
      instruction: "Studio product shots.",
    });

    expect(screen.getByLabelText("Instruction")).toHaveValue("Studio product shots.");
    expect(screen.getByLabelText("Preserve thinking")).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Reasoning/ })).toBeChecked();
  });

  it("submits the settings it was opened with", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({
      mode: "thinking",
      reasoning_effort: "low",
      preserve_thinking: true,
      instruction: "Studio product shots.",
    });

    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "thinking",
      instruction: "Studio product shots.",
      reasoning_effort: "low",
      preserve_thinking: true,
      sysprompt_placement: "off",
    });
  });

  it("submits an edited instruction", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.type(screen.getByLabelText("Instruction"), "Outdoor portraits.");
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "thinking",
      instruction: "Outdoor portraits.",
      reasoning_effort: "medium",
      preserve_thinking: true,
      sysprompt_placement: "off",
    });
  });

  it("saves an instruction under a name and adds it after the typed text", async () => {
    const { requestsTo } = installMockBackend();
    const user = userEvent.setup();
    const onConfirm = renderDialog({ instruction: "Studio product shots." });
    const field = screen.getByLabelText("Instruction");
    const openSaved = async () => {
      await user.click(screen.getByRole("button", { name: "Saved" }));
      return screen.findByRole("dialog", { name: "Saved instructions" });
    };

    let panel = await openSaved();
    await user.click(within(panel).getByRole("button", { name: "Save current instruction..." }));
    await user.type(within(panel).getByLabelText("Name for the instruction"), "Studio{Enter}");
    expect(await within(panel).findByRole("button", { name: /^Studio/ })).toBeInTheDocument();
    expect(requestsTo("/api/preferences/snippets/verify_instructions", "PUT")).toHaveLength(1);
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
      expect.objectContaining({ instruction: "Two people.\n\nStudio product shots." }),
    );
  });

  it("adds the folder's system prompt where it is placed", async () => {
    installMockBackend();
    const user = userEvent.setup();
    const onConfirm = vi.fn<ComponentProps<typeof VerifyCaptionsDialog>["onConfirm"]>();
    renderWithQueryClient(
      <VerifyCaptionsDialog
        scope={{ itemCount: 12, folderLabel: "Photos", kind: "folder" as const }}
        initialSettings={DEFAULTS}
        folderPath={HOME_PATH}
        onConfirm={onConfirm}
        onCancel={vi.fn<() => void>()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "System prompt: Off" }));
    const menu = await screen.findByRole("dialog", { name: "System prompt" });
    expect(within(menu).getByRole("button", { name: /^Off/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await within(menu).findByRole("status")).toHaveTextContent("Would use .sysprompt.");
    await user.click(within(menu).getByRole("button", { name: /^After/ }));

    expect(screen.queryByRole("dialog", { name: "System prompt" })).not.toBeInTheDocument();
    await confirm(user);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ sysprompt_placement: "after" }),
    );
  });

  it("warns on the button when the folder has no system prompt to add", async () => {
    installMockBackend();
    const user = userEvent.setup();
    renderDialog({ sysprompt_placement: "before" });

    const trigger = screen.getByRole("button", { name: "System prompt: Before" });
    await waitFor(() =>
      expect(trigger).toHaveAttribute(
        "title",
        "No system prompt in this folder or above it, so nothing is added.",
      ),
    );
    await user.click(trigger);
    expect(
      within(await screen.findByRole("dialog", { name: "System prompt" })).getByRole("status"),
    ).toHaveTextContent("No system prompt in this folder or above it, so nothing is added.");
  });

  it("submits a cleared Preserve thinking box", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog({ mode: "thinking", preserve_thinking: true, instruction: "" });

    await user.click(screen.getByLabelText("Preserve thinking"));
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: "thinking",
      instruction: "",
      reasoning_effort: "medium",
      preserve_thinking: false,
      sysprompt_placement: "off",
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
