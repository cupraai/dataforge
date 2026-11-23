import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchComfyPresets, fetchComfyWorkflowMap } from "@/features/automation/api/jobs";
import { ComfyGenerateDialog } from "@/features/automation/components/ComfyGenerateDialog";
import { ComfyProcessDialog } from "@/features/automation/components/ComfyProcessDialog";
import { ComfyShowcaseDialog } from "@/features/automation/components/ComfyShowcaseDialog";
import { emptyAutomationSettings } from "@/features/automation/preferences/automationPreferences";
import { useLiveComfyPresets } from "@/features/automation/hooks/useComfyPresets";
import { ServerEventsProvider } from "@/shared/events/ServerEventsProvider";
import type { ComfyPresetSummary } from "@/shared/types";
import { installFakeEventSource, type FakeStream } from "@/test/fakeEventSource";
import { installMockBackend } from "@/test/mockBackend";
import { queryWrapper } from "@/test/queryClient";

vi.mock("@/features/automation/api/jobs", () => ({
  fetchComfyPresets: vi.fn<typeof fetchComfyPresets>(),
  fetchComfyWorkflowMap: vi.fn<typeof fetchComfyWorkflowMap>(),
}));

const fetchPresets = vi.mocked(fetchComfyPresets);
const fetchMap = vi.mocked(fetchComfyWorkflowMap);

const SCOPE = { itemCount: 1, folderLabel: "Renders", kind: "folder" as const };
const SETTINGS = emptyAutomationSettings("/renders");
const noop = () => {};

function listPresets(names: string[], generates: boolean) {
  const presets: ComfyPresetSummary[] = names.map((name) => ({
    name,
    modified_at: null,
    accepts_prompt: true,
    accepts_seed: true,
    inputs: [],
    generates,
    accepts_loras: true,
    source_kind: null,
    accepts_showcase_seed: true,
  }));
  fetchPresets.mockResolvedValue({ presets, available: true, base_url: "http://127.0.0.1:9000" });
}

const DIALOGS: { title: string; generates: boolean; start: string; dialog: ReactNode }[] = [
  {
    title: "Edit with ComfyUI",
    generates: false,
    start: "Start processing",
    dialog: (
      <ComfyProcessDialog
        scope={SCOPE}
        initialSettings={SETTINGS.comfy_process}
        onConfirm={noop}
        onCancel={noop}
      />
    ),
  },
  {
    title: "Generate with ComfyUI",
    generates: true,
    start: "Start generating",
    dialog: (
      <ComfyGenerateDialog
        scope={SCOPE}
        initialSettings={SETTINGS.comfy_generate}
        onConfirm={noop}
        onCancel={noop}
      />
    ),
  },
  {
    title: "Create showcase",
    generates: true,
    start: "Start showcase",
    dialog: (
      <ComfyShowcaseDialog
        scope={SCOPE}
        initialSettings={SETTINGS.comfy_showcase}
        folderPath="/renders"
        folderItems={[]}
        onConfirm={noop}
        onCancel={noop}
      />
    ),
  },
];

function Host({ children }: { children: ReactNode }) {
  useLiveComfyPresets();
  return children;
}

describe.each(DIALOGS)("live presets in $title", ({ generates, start, dialog }) => {
  let stream: FakeStream;

  beforeEach(() => {
    installMockBackend();
    stream = installFakeEventSource();
    fetchMap.mockReset().mockResolvedValue({ name: "m", branch: null, error: "Broken." });
    fetchPresets.mockReset();
    listPresets(["middle", "zebra"], generates);
    render(
      <ServerEventsProvider>
        <Host>{dialog}</Host>
      </ServerEventsProvider>,
      { wrapper: queryWrapper().wrapper },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The folder changes on disk, and the server says so. */
  function change(names: string[]) {
    listPresets(names, generates);
    act(() => stream.push({ type: "comfy_presets" }));
  }

  const radio = (name: string) =>
    within(screen.getByRole("radiogroup", { name: "Workflow presets" })).getByRole("radio", {
      name,
    });

  it("lists an added preset without moving the selection to it", async () => {
    expect(await screen.findByRole("radio", { name: "middle" })).toBeChecked();

    change(["aardvark", "middle", "zebra"]);

    expect(await screen.findByRole("radio", { name: "aardvark" })).not.toBeChecked();
    expect(radio("middle")).toBeChecked();
  });

  it("drops a removed preset and keeps the one selected", async () => {
    await screen.findByRole("radio", { name: "zebra" });

    change(["middle"]);

    await vi.waitFor(() =>
      expect(screen.queryByRole("radio", { name: "zebra" })).not.toBeInTheDocument(),
    );
    expect(radio("middle")).toBeChecked();
  });

  it("selects nothing once the selected preset is removed, until it returns", async () => {
    const user = userEvent.setup();
    const prompt = await screen.findByRole("textbox", { name: "Prompt" });
    await user.click(await screen.findByRole("radio", { name: "zebra" }));
    await user.type(prompt, "a lake");

    change(["middle"]);

    expect(await screen.findByText(/is no longer listed/)).toHaveTextContent(
      "zebra is no longer listed. Choose another preset.",
    );
    expect(radio("middle")).not.toBeChecked();
    expect(screen.getByRole("button", { name: start })).toBeDisabled();
    expect(prompt).toHaveValue("a lake");

    change(["middle", "zebra"]);

    expect(await screen.findByRole("radio", { name: "zebra" })).toBeChecked();
    expect(screen.queryByText(/is no longer listed/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: start })).toBeEnabled();
    expect(prompt).toHaveValue("a lake");
  });

  it("offers the first preset added to an empty folder", async () => {
    await screen.findByRole("radio", { name: "middle" });
    change([]);
    await vi.waitFor(() => expect(screen.queryAllByRole("radio")).toHaveLength(0));

    change(["fresh"]);
    expect(await screen.findByRole("radio", { name: "fresh" })).toBeInTheDocument();
  });
});
