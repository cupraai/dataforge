import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchComfyWorkflowMap, fetchComfyPresets } from "@/features/automation/api/jobs";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type { ComfyPresetSummary, ComfyPresetsResponse } from "@/shared/types";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { ComfyGenerateDialog, type ComfyGenerateSettings } from "./ComfyGenerateDialog";

vi.mock("@/features/automation/api/jobs", () => ({
  fetchComfyPresets: vi.fn<typeof fetchComfyPresets>(),
  fetchComfyWorkflowMap: vi.fn<typeof fetchComfyWorkflowMap>(),
}));

const fetchPresets = vi.mocked(fetchComfyPresets);
const fetchMap = vi.mocked(fetchComfyWorkflowMap);

const SCOPE = { itemCount: 0, folderLabel: "Renders", kind: "destination" as const };

function preset(name: string, overrides: Partial<ComfyPresetSummary> = {}): ComfyPresetSummary {
  return {
    name,
    modified_at: null,
    accepts_prompt: true,
    accepts_seed: true,
    inputs: [],
    generates: true,
    ...overrides,
  };
}

function presets(entries: ComfyPresetSummary[]): ComfyPresetsResponse {
  return { presets: entries, available: true, base_url: "http://127.0.0.1:9000" };
}

function settings(
  overrides: Partial<JobSettingsByType["comfy_generate"]> = {},
): JobSettingsByType["comfy_generate"] {
  return {
    preset: "",
    count: 4,
    name_prefix: "",
    caption_from_prompt: false,
    by_preset: {},
    ...overrides,
  };
}

const EMBEDDED: EmbeddedGenerateWorkflow = {
  mediaPath: "/renders/render_.png",
  mediaName: "render_.png",
  nodeId: "9",
  generation: {
    accepts_prompt: true,
    accepts_seed: true,
    inputs: [],
    prompt_text: "a lighthouse at dusk",
  },
  branch: {
    node_id: "9",
    class_type: "SaveImage",
    label: "Final render",
    is_preview: false,
    matches_filename: true,
    prompts: [],
    parameters: [],
    loras: [],
    stages: [],
    map: [],
  },
};

function renderDialog(initialSettings = settings(), embedded?: EmbeddedGenerateWorkflow) {
  const onConfirm = vi.fn<(settings: ComfyGenerateSettings) => void>();
  const onCancel = vi.fn<() => void>();

  renderWithQueryClient(
    <ComfyGenerateDialog
      scope={SCOPE}
      initialSettings={initialSettings}
      embedded={embedded}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  return { onConfirm, onCancel };
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("radiogroup", { name: "Workflow presets" });
  await user.click(screen.getByRole("button", { name: "Start generating" }));
}

describe("ComfyGenerateDialog", () => {
  beforeEach(() => {
    fetchMap.mockReset().mockResolvedValue({ name: "txt2img", branch: null, error: "Broken." });
    fetchPresets
      .mockReset()
      .mockResolvedValue(
        presets([
          preset("upscale-2x", { generates: false }),
          preset("txt2img"),
          preset("broken", { generates: null, accepts_prompt: null, accepts_seed: null }),
        ]),
      );
  });

  it("says when a workflow loads nothing worth drawing", async () => {
    fetchMap.mockResolvedValue({
      name: "txt2img",
      error: null,
      branch: {
        node_id: "9",
        class_type: "SaveImage",
        label: "Save Image",
        filename_prefix: null,
        filename: null,
        is_preview: false,
        matches_filename: false,
        prompts: [],
        parameters: [],
        loras: [],
        stages: [],
        map: [
          {
            id: "9",
            kind: "output",
            label: "Output",
            detail: [],
            status: "ran",
            feeds: [],
            role: null,
            media: "image",
          },
        ],
      },
    });
    renderDialog();

    expect(await screen.findByText(/loads no models, LoRAs or files/)).toBeInTheDocument();
  });

  it("puts the caption choice beside the prompt it saves", async () => {
    renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    const prompt = screen.getByLabelText("Prompt");
    const caption = screen.getByRole("checkbox", { name: "Save as caption" });
    expect(prompt.closest(".field")).toContainElement(caption);
  });

  it("saves the typed prompt to the prompt book and inserts it after other text", async () => {
    const { requestsTo } = installMockBackend();
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(
      settings({
        preset: "txt2img",
        by_preset: { txt2img: { seed: null, prompt_text: "at dusk", inputs: {} } },
      }),
    );
    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    const prompt = screen.getByLabelText<HTMLTextAreaElement>("Prompt");

    await user.click(screen.getByRole("button", { name: "Saved" }));
    let panel = await screen.findByRole("dialog", { name: "Saved prompts" });
    await user.click(within(panel).getByRole("button", { name: "Save current prompt..." }));
    await user.type(within(panel).getByLabelText("Name for the prompt"), "Dusk{Enter}");
    await within(panel).findByRole("button", { name: /^Dusk/ });
    expect(requestsTo("/api/preferences/snippets/comfy_prompts", "PUT")).toHaveLength(1);

    await user.clear(prompt);
    await user.type(prompt, "a lighthouse");
    await user.click(screen.getByRole("button", { name: "Saved" }));
    panel = await screen.findByRole("dialog", { name: "Saved prompts" });
    await user.click(within(panel).getByRole("button", { name: /^Dusk/ }));

    expect(prompt).toHaveValue("a lighthouse\n\nat dusk");
    expect(prompt).toHaveFocus();
    await start(user);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ promptText: "a lighthouse\n\nat dusk" }),
    );
  });

  it("says where the new files go instead of counting files it never reads", async () => {
    renderDialog();

    expect(await screen.findByText(/New files go to/)).toHaveTextContent("Renders");
    expect(screen.getByText(/Nothing is replaced/)).toBeInTheDocument();
  });

  it("offers only presets without a source loader, and ones it could not parse", async () => {
    renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    const offered = screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"));
    expect(offered).toEqual(["txt2img", "broken"]);
  });

  it("explains generation presets when there are none", async () => {
    fetchPresets.mockResolvedValue(presets([preset("upscale-2x", { generates: false })]));
    renderDialog();

    expect(await screen.findByText(/No generation presets found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start generating" })).toBeDisabled();
  });

  it("starts with the remembered count, prefix and prompt", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(
      settings({
        preset: "txt2img",
        count: 12,
        name_prefix: "lake",
        caption_from_prompt: true,
        by_preset: { txt2img: { seed: 7, prompt_text: "a lake", inputs: {} } },
      }),
    );

    await start(user);

    expect(onConfirm).toHaveBeenCalledWith({
      preset: "txt2img",
      seed: 7,
      promptText: "a lake",
      inputs: {},
      count: 12,
      namePrefix: "lake",
      captionFromPrompt: true,
    });
  });

  it("runs a file's own workflow in place of the presets, from the prompt it was made with", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(
      settings({
        preset: "txt2img",
        name_prefix: "",
        by_preset: { txt2img: { seed: 7, prompt_text: "a lake", inputs: {} } },
      }),
      EMBEDDED,
    );

    const list = await screen.findByRole("radiogroup", { name: "File workflow" });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "render_" })).toBeChecked();
    expect(list).toBeInTheDocument();
    expect(screen.getByText(/not saved as a preset/)).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveValue("a lighthouse at dusk");
    expect(screen.getByLabelText("File name prefix")).toHaveAttribute("placeholder", "render");
    expect(screen.getByText("render_0001")).toBeInTheDocument();
    expect(fetchMap).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start generating" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "render_",
        seed: null,
        promptText: "a lighthouse at dusk",
      }),
    );
  });

  it("leaves an empty seed to be drawn at random", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    expect(await screen.findByLabelText("Seed")).toHaveAttribute("placeholder", "Random");
    expect(screen.getByText(/random each time/)).toBeInTheDocument();
    await start(user);

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ seed: null }));
  });

  it("shows the file names the preset's name gives when no prefix is typed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(screen.getByLabelText("File name prefix")).toHaveAttribute("placeholder", "txt2img");
    expect(screen.getByText("txt2img_0001")).toBeInTheDocument();

    await user.type(screen.getByLabelText("File name prefix"), "harbour");
    expect(screen.getByText("harbour_0001")).toBeInTheDocument();
    await start(user);

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ namePrefix: "harbour" }));
  });

  it("refuses a count outside the limit", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.clear(screen.getByLabelText("Generations"));
    await user.type(screen.getByLabelText("Generations"), "0");
    await start(user);

    expect(screen.getByRole("alert")).toHaveTextContent("from 1 to 100");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses a prefix that is not a plain file name", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("File name prefix"), "renders/lake");
    await start(user);

    expect(screen.getByRole("alert")).toHaveTextContent("cannot contain");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cannot caption with a prompt the preset has no node for", async () => {
    fetchPresets.mockResolvedValue(
      presets([preset("solid", { accepts_prompt: false, accepts_seed: false })]),
    );
    renderDialog(settings({ caption_from_prompt: true }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    const caption = screen.getByRole("checkbox", { name: /caption/ });
    expect(caption).toBeDisabled();
    expect(caption).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    expect(screen.getByText(/runs exactly as saved/)).toBeInTheDocument();
  });
});
