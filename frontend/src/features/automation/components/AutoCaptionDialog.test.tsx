import { instructionFile } from "@/test/instructionFixtures";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type * as FolderInstructionsApi from "@/shared/api/folderInstructions";
import type { VisionLlmState } from "@/features/automation/hooks/useVisionLlmInfo";
import type { VisionLlmInfo } from "@/features/automation/api/visionLlm";
import type { FolderInstructionsResponse, InstructionFileResponse } from "@/shared/types";
import { AutoCaptionDialog } from "./AutoCaptionDialog";
import {
  emptyAutomationSettings,
  type JobSettingsByType,
} from "@/features/automation/preferences/automationPreferences";
import { renderWithQueryClient } from "@/test/queryClient";
import type { ComponentProps } from "react";

const FOLDER = "C:/datasets/photos";

const DEFAULTS: JobSettingsByType["auto_caption"] = emptyAutomationSettings(FOLDER).auto_caption;

const fetchFolderInstructions = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/shared/api/folderInstructions", async (importOriginal) => ({
  ...(await importOriginal<typeof FolderInstructionsApi>()),
  fetchFolderInstructions: (...args: unknown[]) => fetchFolderInstructions(...args),
}));

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

/** What the hook reports once the server answered with `info`; `issue` as the hook words it. */
function served(info: Partial<VisionLlmInfo>, issue: string | null = null) {
  const unreachable = info.reachable === false;
  visionLlm.state = {
    ready: true,
    unreachable,
    service: unreachable ? "offline" : info.detail ? "warning" : "ready",
    issue,
    info: {
      model: "qwen38",
      baseUrl: "http://127.0.0.1:8888/v1",
      servedModel: null,
      reasoningEfforts: null,
      detail: null,
      reachable: true,
      ...info,
    },
  };
}

const NO_FILE = instructionFile();

function instructionsResponse(
  sysprompt: Partial<InstructionFileResponse>,
): FolderInstructionsResponse {
  return {
    sysprompt: instructionFile(sysprompt),
    caption_rules: NO_FILE,
    caption_rules_template: "",
  };
}

beforeEach(() => {
  visionLlm.state = { ready: true, info: null, unreachable: false, service: "ready", issue: null };
  fetchFolderInstructions.mockReset();
  fetchFolderInstructions.mockResolvedValue(
    instructionsResponse({ has_file: true, text: "Describe the scene." }),
  );
});

function renderDialog(
  busy = false,
  onConfirm = vi.fn<ComponentProps<typeof AutoCaptionDialog>["onConfirm"]>(),
  overrides: Partial<JobSettingsByType["auto_caption"]> = {},
) {
  renderWithQueryClient(
    <AutoCaptionDialog
      scope={{ itemCount: 12, folderLabel: "Photos", kind: "folder" as const }}
      folderPath={FOLDER}
      initialSettings={{ ...DEFAULTS, ...overrides }}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={vi.fn<() => void>()}
    />,
  );

  return onConfirm;
}

function audioCheckbox() {
  return screen.getByRole("checkbox", { name: "Caption audio" });
}

function preserveThinkingCheckbox() {
  return screen.getByRole("checkbox", { name: "Preserve thinking" });
}

function footer() {
  return screen.getByRole("dialog").querySelector("footer") as HTMLElement;
}

function confirm(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Start auto-caption" }));
}

describe("AutoCaptionDialog", () => {
  it("starts in reasoning mode with audio off", () => {
    renderDialog();

    expect(screen.getByRole("radio", { name: /Reasoning/ })).toBeChecked();
    expect(audioCheckbox()).not.toBeChecked();
  });

  it("starts at medium effort with thinking preserved", () => {
    renderDialog();

    expect(screen.getByRole("radio", { name: /Medium/ })).toBeChecked();
    expect(preserveThinkingCheckbox()).toBeChecked();
  });

  it("offers every effort level, lowest first", () => {
    renderDialog();

    const efforts = within(screen.getByRole("radiogroup", { name: "Reasoning effort" }));
    expect(efforts.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual(
      ["low", "medium", "high", "xhigh", "max"],
    );
  });

  it("offers only the loaded model's levels and moves a remembered one it lacks", async () => {
    served({
      servedModel: "C:/models/Qwen3.8-27B-Q4_K_XL.gguf",
      reasoningEfforts: ["low", "medium", "xhigh"],
    });
    const user = userEvent.setup();
    const onConfirm = renderDialog(false, undefined, { reasoning_effort: "max" });

    expect(await screen.findByText("Qwen3.8-27B-Q4_K_XL")).toBeInTheDocument();
    const efforts = within(screen.getByRole("radiogroup", { name: "Reasoning effort" }));
    expect(efforts.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual(
      ["low", "medium", "xhigh"],
    );
    expect(efforts.getByRole("radio", { name: /Extra high/ })).toBeChecked();

    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({ ...DEFAULTS, reasoning_effort: "xhigh" });
  });

  it("shows a disabled None level for a model without any and keeps the remembered one", async () => {
    served({ model: "gemma", servedModel: "gemma", reasoningEfforts: [] });
    const user = userEvent.setup();
    const onConfirm = renderDialog(false, undefined, { reasoning_effort: "high" });

    expect(await screen.findByRole("radio", { name: "None" })).toBeChecked();
    const efforts = within(screen.getByRole("radiogroup", { name: "Reasoning effort" }));
    const radios = efforts.getAllByRole("radio");
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual(["none"]);
    expect(radios[0]).toBeDisabled();

    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({ ...DEFAULTS, reasoning_effort: "high" });
  });

  it("shows the vision server ready in the action bar", () => {
    served({ servedModel: "Qwen3.8-27B", reasoningEfforts: ["low", "medium", "xhigh"] });
    renderDialog();

    expect(within(footer()).getByRole("status")).toHaveTextContent("Vision server ready");
  });

  it("puts what is wrong and the fix only in the status tooltip", async () => {
    const issue =
      "The server refused the API key, so every reasoning level is offered. " +
      "Check the vision server in Settings.";
    served({ detail: "The server refused the API key" }, issue);
    const user = userEvent.setup();
    renderDialog();

    const status = within(footer()).getByRole("status");
    expect(status).toHaveTextContent("Vision server needs attention");
    expect(screen.queryByText(issue)).not.toBeInTheDocument();
    const efforts = within(screen.getByRole("radiogroup", { name: "Reasoning effort" }));
    expect(efforts.getAllByRole("radio")).toHaveLength(5);

    await user.hover(status);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(issue);
  });

  it("shows its options while asking the vision server, with the levels loading", () => {
    visionLlm.state = {
      ready: false,
      info: null,
      unreachable: false,
      service: "checking",
      issue: null,
    };
    renderDialog();

    expect(within(footer()).getByRole("status")).toHaveTextContent("Checking the vision server...");
    expect(screen.getByRole("radio", { name: /Reasoning/ })).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading the model's reasoning levels..." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Reasoning effort" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start auto-caption" })).toBeDisabled();
  });

  it("cannot start when the vision server does not answer", async () => {
    served({ detail: "The server did not answer", reachable: false });
    const user = userEvent.setup();
    renderDialog();

    const status = within(footer()).getByRole("status");
    expect(status).toHaveTextContent("Vision server offline");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start auto-caption" })).toBeDisabled();

    await user.hover(status);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "The vision server is not answering at http://127.0.0.1:8888/v1. Start it or check its " +
        "address in Settings.",
    );
  });

  it("submits the mode and leaves audio off by default", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith(DEFAULTS);
  });

  it("submits the audio choice once it is checked", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(audioCheckbox());
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({ ...DEFAULTS, caption_audio: true });
  });

  it("submits the reasoning choices once they are changed", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(screen.getByRole("radio", { name: /Extra high/ }));
    await user.click(preserveThinkingCheckbox());
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({
      ...DEFAULTS,
      reasoning_effort: "xhigh",
      preserve_thinking: false,
    });
  });

  it("disables the reasoning controls in instruct mode", async () => {
    // Instruct turns reasoning off; the controls stay visible to say so.
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("radio", { name: /Instruct/ }));

    expect(screen.getByRole("radio", { name: /Medium/ })).toBeDisabled();
    expect(preserveThinkingCheckbox()).toBeDisabled();
  });

  it("carries the audio choice alongside instruct mode", async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(screen.getByRole("radio", { name: /Instruct/ }));
    await user.click(audioCheckbox());
    await confirm(user);

    expect(onConfirm).toHaveBeenCalledWith({ ...DEFAULTS, mode: "instruct", caption_audio: true });
  });

  it("disables its controls while the job is starting", () => {
    renderDialog(true);

    expect(audioCheckbox()).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Reasoning/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
  });
});

describe("AutoCaptionDialog saved settings", () => {
  it("starts from the settings the last run used", () => {
    renderDialog(false, vi.fn(), {
      mode: "instruct",
      caption_audio: true,
      preserve_thinking: false,
    });

    expect(audioCheckbox()).toBeChecked();
    expect(screen.getByRole("radio", { name: /Instruct/ })).toBeChecked();
  });
});

describe("AutoCaptionDialog system prompt source", () => {
  it.each(["invalid", "empty", "unreadable"] as const)(
    "cannot start with an %s prompt",
    async (status) => {
      const prompt = instructionFile({ has_file: true, text: "Plain text." });
      prompt.state = { ...prompt.state, status, message: "The prompt cannot be used." };
      fetchFolderInstructions.mockResolvedValue(instructionsResponse(prompt));
      const onConfirm = renderDialog();
      expect(await screen.findByRole("alert")).toHaveTextContent("The prompt cannot be used.");
      expect(screen.getByRole("button", { name: "Start auto-caption" })).toBeDisabled();
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it("names the folder's own system prompt above the options", async () => {
    renderDialog();

    expect(await screen.findByText(".sysprompt")).toBeInTheDocument();
    expect(within(footer()).queryByText(".sysprompt")).not.toBeInTheDocument();
    expect(document.querySelector(".dialog-facts")).toHaveTextContent("Uses .sysprompt");
    expect(fetchFolderInstructions).toHaveBeenCalledWith(FOLDER, expect.anything());
  });

  it("names the parent folder an inherited system prompt lives in", async () => {
    fetchFolderInstructions.mockResolvedValue(
      instructionsResponse({
        parent_folder: "C:/datasets",
        parent_relative_path: "../.sysprompt",
        parent_text: "Describe the scene.",
      }),
    );
    renderDialog();

    expect(await screen.findByText("../.sysprompt")).toHaveAttribute(
      "title",
      "C:/datasets\\.sysprompt",
    );
  });

  it("offers no way to edit the system prompt from the dialog", async () => {
    renderDialog();

    await screen.findByText(".sysprompt");

    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cannot start when the system prompt cannot be read", async () => {
    fetchFolderInstructions.mockRejectedValue(new Error("Failed to read the file"));
    const onConfirm = renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to read the file");
    expect(screen.queryByText(/^Uses/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start auto-caption" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
