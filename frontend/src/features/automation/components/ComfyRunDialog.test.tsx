import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchComfyWorkflowMap, fetchComfyPresets } from "@/features/automation/api/jobs";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type {
  ComfyPresetInput,
  ComfyPresetMapResponse,
  ComfyPresetSettings,
  ComfyPresetSummary,
  ComfyPresetsResponse,
} from "@/shared/types";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { ComfyRunDialog, type ComfyRunSettings } from "./ComfyRunDialog";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { stubDialogClock } from "@/test/dialogClock";

vi.mock("@/features/automation/api/jobs", () => ({
  fetchComfyPresets: vi.fn<typeof fetchComfyPresets>(),
  fetchComfyWorkflowMap: vi.fn<typeof fetchComfyWorkflowMap>(),
}));

const fetchPresets = vi.mocked(fetchComfyPresets);
const fetchMap = vi.mocked(fetchComfyWorkflowMap);

function mapOf(name: string, labels: string[]): ComfyPresetMapResponse {
  return {
    name,
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
        ...labels.map((label, index) => ({
          id: String(index),
          kind: "model" as const,
          label,
          detail: [`${label}.safetensors`],
          status: "ran" as const,
          feeds: ["9"],
          role: null,
          media: null,
        })),
        {
          id: "9",
          kind: "output" as const,
          label: "Output",
          detail: [],
          status: "ran" as const,
          feeds: [],
          role: null,
          media: "image" as const,
        },
      ],
    },
  };
}

const SCOPE: DialogScopeInfo = { itemCount: 12, folderLabel: "Photos", kind: "folder" };
const DESTINATION: DialogScopeInfo = { itemCount: 12, folderLabel: "Photos", kind: "destination" };

function settings(
  overrides: Partial<JobSettingsByType["comfy_run"]> = {},
): JobSettingsByType["comfy_run"] {
  return {
    preset: "",
    overwrite_candidates: false,
    count: 1,
    name_prefix: "",
    caption_from_prompt: false,
    by_preset: {},
    ...overrides,
  };
}

function saved(overrides: Partial<ComfyPresetSettings> = {}): ComfyPresetSettings {
  return { seed: null, prompt_text: "", inputs: {}, ...overrides };
}

function presets(
  names: string[],
  available = true,
  baseUrl = "http://127.0.0.1:9000",
  roles: Partial<
    Record<string, { accepts_prompt: boolean | null; accepts_seed: boolean | null }>
  > = {},
): ComfyPresetsResponse {
  return {
    presets: names.map((name) => ({
      name,
      modified_at: null,
      accepts_prompt: roles[name]?.accepts_prompt ?? true,
      accepts_seed: roles[name]?.accepts_seed ?? true,
      inputs: [],
      generates: false,
    })),
    available,
    base_url: baseUrl,
  };
}

interface RenderOptions {
  scope?: DialogScopeInfo;
  editOnly?: boolean;
  embedded?: EmbeddedGenerateWorkflow;
}

function renderDialog(initialSettings = settings(), options: RenderOptions = {}) {
  const onConfirm = vi.fn<(settings: ComfyRunSettings) => void>();
  const onCancel = vi.fn<() => void>();

  renderWithQueryClient(
    <ComfyRunDialog
      scope={options.scope ?? SCOPE}
      destinationScope={DESTINATION}
      initialSettings={initialSettings}
      editOnly={options.editOnly}
      embedded={options.embedded}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  return { onConfirm, onCancel };
}

function presetNames(): (string | null)[] {
  return screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"));
}

describe("ComfyRunDialog with a preset that edits files", () => {
  beforeEach(() => {
    fetchPresets.mockReset().mockResolvedValue(presets(["fix-faces", "upscale-2x"]));
    fetchMap
      .mockReset()
      .mockImplementation(async ({ preset: name = "" }) =>
        mapOf(name, [name === "fix-faces" ? "face-model" : "upscaler"]),
      );
  });

  describe("workflow map", () => {
    it("draws the selected preset and follows a switch", async () => {
      const user = userEvent.setup();
      renderDialog();

      const map = await screen.findByRole("group", { name: "Workflow map" });
      expect(map).toHaveTextContent("face-model");

      await user.click(screen.getByRole("radio", { name: "upscale-2x" }));

      await waitFor(() =>
        expect(screen.getByRole("group", { name: "Workflow map" })).toHaveTextContent("upscaler"),
      );
      expect(fetchMap).toHaveBeenCalledWith(
        expect.objectContaining({ preset: "upscale-2x" }),
        expect.anything(),
      );
    });

    it("says why a preset cannot be drawn", async () => {
      fetchMap.mockResolvedValue({
        name: "fix-faces",
        branch: null,
        error: 'The preset "fix-faces" is an editor workflow, not an API-format one.',
      });
      renderDialog();

      expect(await screen.findByText(/editor workflow, not an API-format one/)).toBeInTheDocument();
    });

    it("shows that ComfyUI answered", async () => {
      renderDialog();

      expect(await screen.findByText("ComfyUI ready")).toHaveAttribute(
        "title",
        "http://127.0.0.1:9000",
      );
    });
  });

  it("blocks Enter while a remembered preset is still loading", async () => {
    fetchPresets.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { passOpenGrace } = stubDialogClock();
    const { onConfirm } = renderDialog(settings({ preset: "example-workflow" }));

    expect(screen.getByRole("button", { name: "Start processing" })).toBeDisabled();
    passOpenGrace();
    await user.keyboard("{Enter}");

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("says where results go", async () => {
    renderDialog();

    // "staging" appears in the overwrite hint too, so this matches the sentence rather
    // than the word.
    expect(await screen.findByText(/writes the result as a/, { exact: false })).toBeInTheDocument();
  });

  it("lists every preset on disk with what it takes", async () => {
    renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(presetNames()).toEqual(["fix-faces", "upscale-2x"]);
    expect(screen.getByRole("radio", { name: "fix-faces" })).toHaveAccessibleDescription(
      "Prompt · Seed",
    );
  });

  it("says which presets could not be read before one is chosen", async () => {
    const listed = presets(["fix-faces", "broken"]);
    listed.presets[1] = {
      ...listed.presets[1],
      accepts_prompt: null,
      accepts_seed: null,
      generates: null,
    };
    fetchPresets.mockResolvedValue(listed);
    renderDialog();

    expect(await screen.findByRole("radio", { name: "broken" })).toHaveAccessibleDescription(
      "Could not be read",
    );
  });

  it("lists generation presets beside the ones that edit files", async () => {
    const listed = presets(["txt2img", "upscale-2x"]);
    listed.presets[0] = { ...listed.presets[0], generates: true };
    fetchPresets.mockResolvedValue(listed);
    renderDialog(settings({ preset: "upscale-2x" }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(presetNames()).toEqual(["txt2img", "upscale-2x"]);
  });

  it("offers only presets that edit files as a workflow step", async () => {
    const listed = presets(["txt2img", "upscale-2x"]);
    listed.presets[0] = { ...listed.presets[0], generates: true };
    fetchPresets.mockResolvedValue(listed);
    renderDialog(settings({ preset: "txt2img" }), { editOnly: true });

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(presetNames()).toEqual(["upscale-2x"]);
    expect(screen.getByRole("radio", { name: "upscale-2x" })).toBeChecked();
  });

  it("cannot edit a scope with no files in it", async () => {
    renderDialog(settings(), { scope: { ...SCOPE, itemCount: 0 } });

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(screen.getByRole("button", { name: "Start processing" })).toBeDisabled();
  });

  it("starts from the preset the last run used", async () => {
    renderDialog(settings({ preset: "upscale-2x" }));

    expect(await screen.findByRole("radio", { name: "upscale-2x" })).toBeChecked();
  });

  it("falls back to the first preset when the remembered one is gone", async () => {
    // A stored preset name can outlive its file.
    renderDialog(settings({ preset: "deleted-preset" }));

    expect(await screen.findByRole("radio", { name: "fix-faces" })).toBeChecked();
  });

  it("explains how to add one when there are none", async () => {
    fetchPresets.mockResolvedValue(presets([]));

    renderDialog();

    expect(await screen.findByText(/Save \(API Format\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start processing" })).toBeDisabled();
  });

  it("warns but does not block when ComfyUI is not answering", async () => {
    // ComfyUI is started and stopped all day; the job only needs it by the first image.
    fetchPresets.mockResolvedValue(presets(["upscale-2x"], false));

    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("not answering");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start processing" })).toBeEnabled(),
    );
  });

  it("names the origin it probed so a wrong port is visible", async () => {
    // A wrong COMFY_BASE_URL must not read as "ComfyUI is stopped".
    fetchPresets.mockResolvedValue(presets(["upscale-2x"], false, "http://127.0.0.1:9123"));

    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("http://127.0.0.1:9123");
  });

  it("spins while the presets are still loading", async () => {
    // The probe can take the whole request timeout, so it must look busy.
    let resolvePresets: (value: ComfyPresetsResponse) => void = () => {};
    fetchPresets.mockReturnValue(
      new Promise<ComfyPresetsResponse>((resolve) => {
        resolvePresets = resolve;
      }),
    );

    renderDialog();

    // The dialog is portalled, so the spinner is found inside the status row.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading workflow presets");
    expect(status.querySelector(".app-icon--spin")).toBeTruthy();

    resolvePresets(presets(["upscale-2x"]));

    expect(await screen.findByRole("radiogroup", { name: "Workflow presets" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("starts with the chosen preset and seed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(await screen.findByRole("radio", { name: "upscale-2x" }));
    await user.type(screen.getByLabelText("Seed"), "4321");

    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(onConfirm).toHaveBeenCalledWith({
      preset: "upscale-2x",
      seed: 4321,
      promptText: "",
      inputs: {},
      generates: false,
      overwriteCandidates: false,
      count: 1,
      namePrefix: "",
      captionFromPrompt: false,
    });
  });

  it("replaces waiting candidates when asked to", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.click(screen.getByLabelText(/Replace candidates already waiting/));
    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ overwriteCandidates: true }));
  });

  it("leaves the preset's own seeds alone when the field is empty", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ seed: null, preset: "fix-faces" }),
    );
  });

  it("sends the prompt for the preset's DataForge Prompt node", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("Prompt"), "sharp studio photograph");

    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ promptText: "sharp studio photograph" }),
    );
  });

  it("lists the saved ComfyUI prompts, not the caption instructions", async () => {
    installMockBackend();
    const put = (book: string, name: string, text: string) =>
      fetch(`/api/preferences/snippets/${book}`, {
        method: "PUT",
        body: JSON.stringify({ name, text }),
      });
    await put("instructions", "Tense", "Use present tense.");
    await put("comfy_prompts", "Studio", "sharp studio photograph");
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    await user.click(screen.getByRole("button", { name: "Saved" }));
    const panel = await screen.findByRole("dialog", { name: "Saved prompts" });
    await user.click(await within(panel).findByRole("button", { name: /^Studio/ }));

    expect(within(panel).queryByText("Tense")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveValue("sharp studio photograph");
  });

  it("starts from the prompt the last run used", async () => {
    renderDialog(
      settings({
        preset: "fix-faces",
        by_preset: { "fix-faces": saved({ prompt_text: "no watermark" }) },
      }),
    );

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(screen.getByLabelText("Prompt")).toHaveValue("no watermark");
  });

  it("shows each preset's own remembered prompt and seed", async () => {
    const user = userEvent.setup();
    renderDialog(
      settings({
        preset: "fix-faces",
        overwrite_candidates: true,
        by_preset: {
          "fix-faces": saved({ prompt_text: "no watermark", seed: 7 }),
          "upscale-2x": saved({ prompt_text: "crisp" }),
        },
      }),
    );

    await user.click(await screen.findByRole("radio", { name: "upscale-2x" }));

    expect(screen.getByLabelText("Prompt")).toHaveValue("crisp");
    expect(screen.getByLabelText("Seed")).toHaveValue(null);
    // The checkbox is not per preset, so switching leaves it as it was.
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("keeps what was typed for a preset after switching away and back", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("Prompt"), "sharp");
    await user.click(screen.getByRole("radio", { name: "upscale-2x" }));
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    await user.click(screen.getByRole("radio", { name: "fix-faces" }));

    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "fix-faces", promptText: "sharp" }),
    );
  });

  // Whitespace means run the graph as saved, so it is trimmed before sending.
  it("treats a whitespace-only prompt as none at all", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("Prompt"), "   ");

    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ promptText: "" }));
  });

  it("names the node each of the prompt and seed is written into", async () => {
    renderDialog();
    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(screen.getByLabelText("Prompt")).toHaveAccessibleDescription(
      "Optional; written into the preset's DataForge Prompt node.",
    );
    expect(screen.getByLabelText("Seed")).toHaveAccessibleDescription(
      "Optional; written into the preset's DataForge Seed node.",
    );
  });

  // `type="number"` still lets a sign and a decimal point through.
  it("refuses a seed that is not a whole number", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("Seed"), "-5");

    await user.click(screen.getByRole("button", { name: "Start processing" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("whole number");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("reports a failure to list presets", async () => {
    fetchPresets.mockRejectedValue(new Error("Backend is down"));

    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Backend is down");
  });

  describe("custom DataForge inputs", () => {
    const INPUTS: ComfyPresetInput[] = [
      { name: "Denoise", kind: "number", default: 0.5 },
      { name: "Steps", kind: "integer", default: 20 },
      { name: "Tiled", kind: "boolean", default: false },
      { name: "Style", kind: "text", default: "photo" },
    ];

    function withInputs(): ComfyPresetsResponse {
      const response = presets(["detailer", "upscale-2x"]);
      response.presets[0].inputs = INPUTS;
      return response;
    }

    it("shows a field per input with the saved value as its placeholder", async () => {
      fetchPresets.mockResolvedValue(withInputs());
      renderDialog();

      await screen.findByRole("radiogroup", { name: "Workflow presets" });

      expect(screen.getByLabelText("Denoise")).toHaveAttribute("placeholder", "0.5");
      expect(screen.getByLabelText("Steps")).toHaveAttribute("placeholder", "20");
      expect(screen.getByLabelText("Style")).toHaveAttribute("placeholder", "photo");
      expect(screen.getByLabelText("Tiled")).toHaveDisplayValue("Default (off)");
    });

    it("sends typed values and leaves empty fields to the preset", async () => {
      fetchPresets.mockResolvedValue(withInputs());
      const user = userEvent.setup();
      const { onConfirm } = renderDialog();

      await screen.findByRole("radiogroup", { name: "Workflow presets" });
      await user.type(screen.getByLabelText("Denoise"), "0.35");
      await user.selectOptions(screen.getByLabelText("Tiled"), "on");
      await user.click(screen.getByRole("button", { name: "Start processing" }));

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ preset: "detailer", inputs: { Denoise: 0.35, Tiled: true } }),
      );
    });

    it("refuses a fraction for a whole-number input", async () => {
      fetchPresets.mockResolvedValue(withInputs());
      const user = userEvent.setup();
      const { onConfirm } = renderDialog();

      await screen.findByRole("radiogroup", { name: "Workflow presets" });
      await user.type(screen.getByLabelText("Steps"), "2.5");
      await user.click(screen.getByRole("button", { name: "Start processing" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Steps must be a whole number");
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("restores remembered values and drops names the preset no longer has", async () => {
      fetchPresets.mockResolvedValue(withInputs());
      const user = userEvent.setup();
      const { onConfirm } = renderDialog(
        settings({
          preset: "detailer",
          by_preset: { detailer: saved({ inputs: { Steps: 30, Removed: 1 } }) },
        }),
      );

      await screen.findByRole("radiogroup", { name: "Workflow presets" });
      expect(screen.getByLabelText("Steps")).toHaveValue(30);
      await user.click(screen.getByRole("button", { name: "Start processing" }));

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ inputs: { Steps: 30 } }));
    });

    it("shows no custom fields for a preset without them", async () => {
      fetchPresets.mockResolvedValue(withInputs());
      const user = userEvent.setup();
      renderDialog();

      await user.click(await screen.findByRole("radio", { name: "upscale-2x" }));

      expect(screen.queryByLabelText("Denoise")).not.toBeInTheDocument();
    });

    it("redraws the map as the inputs would run, skipping one that does not parse", async () => {
      // A switch input picks a branch; the map has to show the one this run would take.
      fetchPresets.mockResolvedValue(withInputs());
      fetchMap.mockImplementation(async ({ preset: name = "", inputs = {} }) =>
        mapOf(name, [inputs.Tiled === true ? "tiled-pass" : "plain-pass"]),
      );
      const user = userEvent.setup();
      renderDialog();

      const map = await screen.findByRole("group", { name: "Workflow map" });
      expect(map).toHaveTextContent("plain-pass");

      await user.type(screen.getByLabelText("Steps"), "2.5");
      await user.selectOptions(screen.getByLabelText("Tiled"), "on");

      await waitFor(() =>
        expect(screen.getByRole("group", { name: "Workflow map" })).toHaveTextContent("tiled-pass"),
      );
      expect(fetchMap).toHaveBeenLastCalledWith(
        { preset: "detailer", inputs: { Tiled: true } },
        expect.anything(),
      );
    });
  });

  describe("a preset without the optional nodes", () => {
    const withoutPrompt = () =>
      presets(["video-upscale"], true, "http://127.0.0.1:9000", {
        "video-upscale": { accepts_prompt: false, accepts_seed: true },
      });

    it("does not send a prompt the preset has nowhere to put", async () => {
      // A parse that later succeeds can leave a stored prompt behind for a promptless preset.
      fetchPresets.mockResolvedValue(withoutPrompt());
      const user = userEvent.setup();
      const { onConfirm } = renderDialog(
        settings({
          preset: "video-upscale",
          by_preset: { "video-upscale": saved({ prompt_text: "sharp studio photograph" }) },
        }),
      );

      await screen.findByRole("radiogroup", { name: "Workflow presets" });
      await user.click(screen.getByRole("button", { name: "Start processing" }));

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ preset: "video-upscale", promptText: "" }),
      );
    });

    it("disables the prompt and names the missing node", async () => {
      fetchPresets.mockResolvedValue(withoutPrompt());
      renderDialog(
        settings({
          preset: "video-upscale",
          by_preset: { "video-upscale": saved({ prompt_text: "sharp studio photograph" }) },
        }),
      );

      // Prompt renders before the presets land, so only the preset list marks the load as done.
      await screen.findByRole("radiogroup", { name: "Workflow presets" });

      const prompt = screen.getByLabelText("Prompt");
      expect(prompt).toBeDisabled();
      expect(prompt).toHaveValue("");
      expect(screen.getByText(/has no/)).toHaveTextContent("DataForge Prompt");
      expect(screen.getByLabelText("Seed")).toBeEnabled();
    });

    it("drops a seed the preset has nowhere to put", async () => {
      // Unlike the prompt this was never refused: build_comfy_prompt just wrote nothing.
      fetchPresets.mockResolvedValue(
        presets(["lanczos"], true, "http://127.0.0.1:9000", {
          lanczos: { accepts_prompt: false, accepts_seed: false },
        }),
      );
      const user = userEvent.setup();
      const { onConfirm } = renderDialog(
        settings({
          preset: "lanczos",
          by_preset: { lanczos: saved({ seed: 4321, prompt_text: "anything" }) },
        }),
      );

      await screen.findByRole("radiogroup", { name: "Workflow presets" });
      expect(await screen.findByLabelText("Seed")).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Start processing" }));

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ seed: null, promptText: "" }),
      );
    });

    it("leaves both fields live when the preset could not be parsed", async () => {
      // Null is "unknown", not "no": the queue-time message names the fix better than a
      // greyed-out box does.
      fetchPresets.mockResolvedValue(
        presets(["broken"], true, "http://127.0.0.1:9000", {
          broken: { accepts_prompt: null, accepts_seed: null },
        }),
      );
      renderDialog();

      await screen.findByRole("radiogroup", { name: "Workflow presets" });

      expect(screen.getByLabelText("Prompt")).toBeEnabled();
      expect(screen.getByLabelText("Seed")).toBeEnabled();
    });
  });
});

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

function generationPreset(
  name: string,
  overrides: Partial<ComfyPresetSummary> = {},
): ComfyPresetSummary {
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

function generationPresets(entries: ComfyPresetSummary[]): ComfyPresetsResponse {
  return { presets: entries, available: true, base_url: "http://127.0.0.1:9000" };
}

async function startGenerating(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("radiogroup", { name: "Workflow presets" });
  await user.click(screen.getByRole("button", { name: "Start generating" }));
}

describe("ComfyRunDialog with a preset that makes new files", () => {
  // Nothing in scope: a generation runs anyway, since it reads no files.
  const EMPTY_SCOPE: DialogScopeInfo = { ...SCOPE, itemCount: 0 };
  const generationSettings = (overrides: Partial<JobSettingsByType["comfy_run"]> = {}) =>
    settings({ preset: "txt2img", count: 4, ...overrides });
  const renderGeneration = (initialSettings = generationSettings()) =>
    renderDialog(initialSettings, { scope: EMPTY_SCOPE });

  beforeEach(() => {
    fetchMap.mockReset().mockResolvedValue({ name: "txt2img", branch: null, error: "Broken." });
    fetchPresets
      .mockReset()
      .mockResolvedValue(
        generationPresets([
          generationPreset("upscale-2x", { generates: false }),
          generationPreset("txt2img"),
          generationPreset("broken", { generates: null, accepts_prompt: null, accepts_seed: null }),
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
    renderGeneration();

    expect(await screen.findByText(/loads no models, LoRAs or files/)).toBeInTheDocument();
  });

  it("puts the caption choice beside the prompt it saves", async () => {
    renderGeneration();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    const prompt = screen.getByLabelText("Prompt");
    const caption = screen.getByRole("checkbox", { name: "Save as caption" });
    expect(prompt.closest(".field")).toContainElement(caption);
  });

  it("saves the typed prompt to the prompt book and inserts it after other text", async () => {
    const { requestsTo } = installMockBackend();
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration(
      generationSettings({
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
    await startGenerating(user);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ promptText: "a lighthouse\n\nat dusk" }),
    );
  });

  it("says where the new files go instead of counting files it never reads", async () => {
    renderGeneration();

    expect(await screen.findByText(/New files go to/)).toHaveTextContent("Photos");
    expect(screen.getByText(/Nothing is replaced/)).toBeInTheDocument();
  });

  it("switches to the edit's options when a preset that edits files is chosen", async () => {
    const user = userEvent.setup();
    renderGeneration();

    expect(await screen.findByLabelText("Generations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start generating" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: "upscale-2x" }));

    expect(screen.queryByLabelText("Generations")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Replace candidates already waiting/)).toBeInTheDocument();
    expect(screen.getByText(/writes the result as a/)).toBeInTheDocument();
    // The scope is empty, and an edit needs files.
    expect(screen.getByRole("button", { name: "Start processing" })).toBeDisabled();
  });

  it("starts with the remembered count, prefix and prompt", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration(
      generationSettings({
        count: 12,
        name_prefix: "lake",
        caption_from_prompt: true,
        by_preset: { txt2img: { seed: 7, prompt_text: "a lake", inputs: {} } },
      }),
    );

    await startGenerating(user);

    expect(onConfirm).toHaveBeenCalledWith({
      preset: "txt2img",
      seed: 7,
      promptText: "a lake",
      inputs: {},
      generates: true,
      overwriteCandidates: false,
      count: 12,
      namePrefix: "lake",
      captionFromPrompt: true,
    });
  });

  it("runs a file's own workflow in place of the presets, from the prompt it was made with", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(
      generationSettings({
        by_preset: { txt2img: { seed: 7, prompt_text: "a lake", inputs: {} } },
      }),
      { scope: EMPTY_SCOPE, embedded: EMBEDDED },
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
        generates: true,
      }),
    );
  });

  it("leaves an empty seed to be drawn at random", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(screen.getByLabelText("Seed")).toHaveAttribute("placeholder", "Random");
    expect(screen.getByText(/random each time/)).toBeInTheDocument();
    await startGenerating(user);

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ seed: null }));
  });

  it("shows the file names the preset's name gives when no prefix is typed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(screen.getByLabelText("File name prefix")).toHaveAttribute("placeholder", "txt2img");
    expect(screen.getByText("txt2img_0001")).toBeInTheDocument();

    await user.type(screen.getByLabelText("File name prefix"), "harbour");
    expect(screen.getByText("harbour_0001")).toBeInTheDocument();
    await startGenerating(user);

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ namePrefix: "harbour" }));
  });

  it("refuses a count outside the limit", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.clear(screen.getByLabelText("Generations"));
    await user.type(screen.getByLabelText("Generations"), "0");
    await startGenerating(user);

    expect(screen.getByRole("alert")).toHaveTextContent("from 1 to 100");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses a prefix that is not a plain file name", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("File name prefix"), "renders/lake");
    await startGenerating(user);

    expect(screen.getByRole("alert")).toHaveTextContent("cannot contain");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cannot caption with a prompt the preset has no node for", async () => {
    fetchPresets.mockResolvedValue(
      generationPresets([
        generationPreset("solid", { accepts_prompt: false, accepts_seed: false }),
      ]),
    );
    renderGeneration(generationSettings({ preset: "solid", caption_from_prompt: true }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    const caption = screen.getByRole("checkbox", { name: /caption/ });
    expect(caption).toBeDisabled();
    expect(caption).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    expect(screen.getByLabelText("Prompt")).toHaveAccessibleDescription(
      "No DataForge Prompt node, so the saved prompt runs.",
    );
    expect(screen.getByLabelText("Seed")).toHaveAccessibleDescription(
      "No seed to vary, so every generation runs alike.",
    );
  });
});
