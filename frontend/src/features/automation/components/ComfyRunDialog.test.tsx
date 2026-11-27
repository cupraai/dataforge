import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchComfyWorkflowMap, fetchComfyPresets } from "@/features/automation/api/jobs";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import type { EmbeddedGenerateWorkflow } from "@/features/automation/types";
import type {
  ComfyPresetInput,
  ComfyPresetMapResponse,
  ComfyPresetSummary,
  ComfyPresetsResponse,
  ComfyRunPresetSettings,
  GalleryItem,
} from "@/shared/types";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { ComfyRunDialog, type ComfyRunSettings } from "./ComfyRunDialog";
import { mediaItem } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { queryWrapper, renderWithQueryClient } from "@/test/queryClient";
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
      mismatches: [],
      prompts: [],
      parameters: [],
      loras: [],
      stages: [],
      shared: [],
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

function saved(overrides: Partial<ComfyRunPresetSettings> = {}): ComfyRunPresetSettings {
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
  folderItems?: GalleryItem[];
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
      folderItems={options.folderItems ?? []}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  return { onConfirm, onCancel };
}

/** The ComfyUI indicator at the left of the action bar. */
function comfyStatus(): HTMLElement {
  const footer = screen.getByRole("dialog").querySelector("footer") as HTMLElement;
  return within(footer).getByRole("status");
}

function presetNames(): (string | null)[] {
  return within(screen.getByRole("radiogroup", { name: "Workflow presets" }))
    .getAllByRole("radio")
    .map((radio) => radio.getAttribute("aria-label"));
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

    it("draws the typed prompt and seed in place of the saved ones", async () => {
      const user = userEvent.setup();
      renderDialog();

      await screen.findByRole("group", { name: "Workflow map" });
      await user.type(screen.getByLabelText("Prompt"), "sharp studio photograph");
      await user.type(screen.getByLabelText("Seed"), "42");

      await waitFor(() =>
        expect(fetchMap).toHaveBeenLastCalledWith(
          expect.objectContaining({
            preset: "fix-faces",
            prompt_text: "sharp studio photograph",
            seed: 42,
          }),
          expect.anything(),
        ),
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
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => expect(comfyStatus()).toHaveTextContent("ComfyUI ready"));
      await user.hover(comfyStatus());
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Answering at http://127.0.0.1:9000",
      );
    });
  });

  it("blocks Enter while a remembered preset is still loading", async () => {
    fetchPresets.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { passOpenGrace } = stubDialogClock();
    const { onConfirm } = renderDialog(settings({ preset: "example-workflow" }));

    expect(screen.getByRole("button", { name: "Start workflow" })).toBeDisabled();
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
    // A step runs on files chosen beforehand, so it can only edit them.
    expect(screen.getByRole("radio", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Edit" })).toBeChecked();
  });

  it("cannot edit a scope with no files in it", async () => {
    renderDialog(settings(), { scope: { ...SCOPE, itemCount: 0 } });

    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(screen.getByRole("button", { name: "Start workflow" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Start workflow" })).toBeDisabled();
  });

  it("cannot start while ComfyUI is not answering", async () => {
    fetchPresets.mockResolvedValue(presets(["upscale-2x"], false));

    renderDialog();

    await waitFor(() => expect(comfyStatus()).toHaveTextContent("ComfyUI offline"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start workflow" })).toBeDisabled();
  });

  it("still saves a workflow step while ComfyUI is not answering", async () => {
    // A step runs later, when ComfyUI may be up again.
    fetchPresets.mockResolvedValue(presets(["upscale-2x"], false));

    renderDialog(settings(), { editOnly: true });

    await waitFor(() => expect(comfyStatus()).toHaveTextContent("ComfyUI offline"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start workflow" })).toBeEnabled(),
    );
  });

  it("checks ComfyUI again on opening before it can start", async () => {
    // The list is cached from an earlier dialog, when ComfyUI may have been in another state.
    fetchPresets.mockResolvedValue(presets(["upscale-2x"], false));
    const { client, wrapper } = queryWrapper();
    const dialog = (
      <ComfyRunDialog
        scope={SCOPE}
        destinationScope={DESTINATION}
        initialSettings={settings()}
        folderItems={[]}
        onConfirm={vi.fn<(settings: ComfyRunSettings) => void>()}
        onCancel={vi.fn<() => void>()}
      />
    );
    const first = render(dialog, { wrapper });
    await waitFor(() => expect(comfyStatus()).toHaveTextContent("ComfyUI offline"));
    first.unmount();
    let answer: (value: ComfyPresetsResponse) => void = () => {};
    fetchPresets.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    render(dialog, { wrapper });

    expect(comfyStatus()).toHaveTextContent("Checking ComfyUI...");
    expect(screen.getByRole("button", { name: "Start workflow" })).toBeDisabled();
    answer(presets(["upscale-2x"]));
    await waitFor(() => expect(comfyStatus()).toHaveTextContent("ComfyUI ready"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start workflow" })).toBeEnabled(),
    );
    expect(client.getQueryData(["comfy-presets"])).toMatchObject({ available: true });
  });

  it("names the origin it probed and the fix in the status tooltip", async () => {
    // A wrong address must not read as "ComfyUI is stopped".
    fetchPresets.mockResolvedValue(presets(["upscale-2x"], false, "http://127.0.0.1:9123"));
    const user = userEvent.setup();

    renderDialog();
    await waitFor(() => expect(comfyStatus()).toHaveTextContent("ComfyUI offline"));
    await user.hover(comfyStatus());

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "ComfyUI is not answering at http://127.0.0.1:9123. Start it or check its address in Settings.",
    );
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
    const status = screen.getByText("Loading workflow presets...").closest("[role=status]");
    expect(status?.querySelector(".app-icon--spin")).toBeTruthy();
    expect(comfyStatus()).toHaveTextContent("Checking ComfyUI...");

    resolvePresets(presets(["upscale-2x"]));

    expect(await screen.findByRole("radiogroup", { name: "Workflow presets" })).toBeInTheDocument();
    expect(screen.queryByText("Loading workflow presets...")).not.toBeInTheDocument();
  });

  it("starts with the chosen preset and seed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(await screen.findByRole("radio", { name: "upscale-2x" }));
    await user.type(screen.getByLabelText("Seed"), "4321");

    await user.click(screen.getByRole("button", { name: "Start workflow" }));

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
      mode: "edit",
      startPath: null,
    });
  });

  it("replaces waiting candidates when asked to", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.click(screen.getByLabelText(/Replace candidates already waiting/));
    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ overwriteCandidates: true }));
  });

  it("leaves the preset's own seeds alone when the field is empty", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ seed: null, preset: "fix-faces" }),
    );
  });

  it("sends the prompt for the preset's DataForge Prompt node", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("Prompt"), "sharp studio photograph");

    await user.click(screen.getByRole("button", { name: "Start workflow" }));

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

    await user.click(screen.getByRole("button", { name: "Start workflow" }));

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

    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ promptText: "" }));
  });

  it("says in the empty fields what runs without them", async () => {
    renderDialog();
    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    expect(screen.getByLabelText("Prompt")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Empty runs the saved prompt."),
    );
    expect(screen.getByLabelText("Seed")).toHaveAttribute("placeholder", "Preset's own");
  });

  it("groups the fields into inputs and output", async () => {
    renderDialog();
    await screen.findByRole("radiogroup", { name: "Workflow presets" });

    const inputs = screen.getByRole("group", { name: "Inputs" });
    const output = screen.getByRole("group", { name: "Output" });
    expect(within(inputs).getByLabelText("Prompt")).toBeInTheDocument();
    expect(within(inputs).getByLabelText("Seed")).toBeInTheDocument();
    expect(within(output).getByLabelText(/Replace candidates already waiting/)).toBeInTheDocument();
  });

  // `type="number"` still lets a sign and a decimal point through.
  it("refuses a seed that is not a whole number", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.type(screen.getByLabelText("Seed"), "-5");

    await user.click(screen.getByRole("button", { name: "Start workflow" }));

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
      await user.click(screen.getByRole("button", { name: "Start workflow" }));

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
      await user.click(screen.getByRole("button", { name: "Start workflow" }));

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
      await user.click(screen.getByRole("button", { name: "Start workflow" }));

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
      await user.click(screen.getByRole("button", { name: "Start workflow" }));

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ preset: "video-upscale", promptText: "" }),
      );
    });

    it("leaves out the prompt and says why", async () => {
      fetchPresets.mockResolvedValue(withoutPrompt());
      renderDialog(
        settings({
          preset: "video-upscale",
          by_preset: { "video-upscale": saved({ prompt_text: "sharp studio photograph" }) },
        }),
      );

      // Prompt renders before the presets land, so only the preset list marks the load as done.
      await screen.findByRole("radiogroup", { name: "Workflow presets" });

      expect(screen.queryByLabelText("Prompt")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Saved" })).not.toBeInTheDocument();
      expect(screen.getByText("Runs its saved prompt: no DataForge Prompt node.")).toBeVisible();
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
      expect(screen.queryByLabelText("Seed")).not.toBeInTheDocument();
      expect(screen.getByText("Runs its saved seeds: no DataForge Seed node.")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Start workflow" }));

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
    mismatches: [],
    prompts: [],
    parameters: [],
    loras: [],
    stages: [],
    shared: [],
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
  await user.click(screen.getByRole("button", { name: "Start workflow" }));
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
        mismatches: [],
        prompts: [],
        parameters: [],
        loras: [],
        stages: [],
        shared: [],
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
    expect(screen.getByRole("button", { name: "Start workflow" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: "upscale-2x" }));

    expect(screen.queryByLabelText("Generations")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Replace candidates already waiting/)).toBeInTheDocument();
    expect(screen.getByText(/writes the result as a/)).toBeInTheDocument();
    // The scope is empty, and an edit needs files.
    expect(screen.getByRole("button", { name: "Start workflow" })).toBeDisabled();
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
      mode: "generate",
      startPath: null,
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
    expect(within(list).getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "render_" })).toBeChecked();
    // A file's own workflow only makes new files.
    expect(screen.getByRole("radio", { name: "Edit" })).toBeDisabled();
    // It loads no file, so there is neither a start file to choose nor anything to edit.
    expect(screen.queryByRole("button", { name: /^Start image/ })).not.toBeInTheDocument();
    expect(list).toBeInTheDocument();
    expect(screen.getByText(/not saved as a preset/)).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveValue("a lighthouse at dusk");
    expect(screen.getByLabelText("File name prefix")).toHaveAttribute("placeholder", "render");
    expect(screen.getByText("render_0001")).toBeInTheDocument();
    expect(fetchMap).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "render_",
        seed: null,
        promptText: "a lighthouse at dusk",
        generates: true,
      }),
    );
  });

  it("redraws a file's own workflow once its prompt is changed", async () => {
    const user = userEvent.setup();
    renderDialog(generationSettings(), { scope: EMPTY_SCOPE, embedded: EMBEDDED });

    await screen.findByRole("radiogroup", { name: "File workflow" });
    // The saved prompt is what the saved map already draws.
    expect(fetchMap).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Prompt"), " at night");

    await waitFor(() =>
      expect(fetchMap).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: { path: EMBEDDED.mediaPath, node_id: "9" },
          prompt_text: "a lighthouse at dusk at night",
        }),
        expect.anything(),
      ),
    );
  });

  it("leaves an empty seed to be drawn at random", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderGeneration();

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(screen.getByLabelText("Seed")).toHaveAttribute("placeholder", "Random");
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

    expect(screen.queryByRole("checkbox", { name: /caption/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saved" })).not.toBeInTheDocument();
    expect(screen.getByText("Runs its saved prompt: no DataForge Prompt node.")).toBeVisible();
    expect(screen.getByText("No seed to vary, so every generation runs alike.")).toBeVisible();
  });
});

describe("ComfyRunDialog with a preset that loads a file", () => {
  const FOLDER = "C:\\renders";
  const START = mediaItem("start.png", FOLDER, { modified_at: "2026-03-01T10:00:00Z" });
  const loader = (overrides: Partial<ComfyPresetSummary> = {}) =>
    generationPreset("i2v", {
      generates: false,
      source_kind: "image",
      accepts_seed: false,
      accepts_generation_seed: true,
      ...overrides,
    });
  const whatItDoes = () => screen.getByRole("radiogroup", { name: "What the run does" });

  beforeEach(() => {
    fetchMap.mockReset().mockResolvedValue(mapOf("i2v", ["video-model"]));
    fetchPresets
      .mockReset()
      .mockResolvedValue(generationPresets([loader(), generationPreset("txt2img")]));
  });

  it("edits the scope's files unless asked to make new ones", async () => {
    renderDialog(settings({ preset: "i2v" }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(within(whatItDoes()).getByRole("radio", { name: "Edit" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Start workflow" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Start image/ })).not.toBeInTheDocument();
  });

  it("makes new files from a start image picked from the folder", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(settings({ preset: "i2v" }), { folderItems: [START] });

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.click(within(whatItDoes()).getByRole("radio", { name: "Generate" }));
    expect(screen.getByText(/New files go to/)).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMap).toHaveBeenLastCalledWith(
        expect.objectContaining({ preset: "i2v", mode: "generate" }),
        expect.anything(),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Start image: none" }));
    await user.click(await screen.findByRole("option", { name: "start.png" }));
    await waitFor(() =>
      expect(fetchMap).toHaveBeenLastCalledWith(
        expect.objectContaining({ start_path: START.path }),
        expect.anything(),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "i2v",
        generates: true,
        mode: "generate",
        startPath: START.path,
      }),
    );
  });

  it("sends no start file when editing, even after one was picked", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(settings({ preset: "i2v" }), { folderItems: [START] });

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    await user.click(within(whatItDoes()).getByRole("radio", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Start image: none" }));
    await user.click(await screen.findByRole("option", { name: "start.png" }));
    await user.click(within(whatItDoes()).getByRole("radio", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ generates: false, mode: "edit", startPath: null }),
    );
  });

  it("starts from what the preset did last time", async () => {
    renderDialog(settings({ preset: "i2v", by_preset: { i2v: saved({ mode: "generate" }) } }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(within(whatItDoes()).getByRole("radio", { name: "Generate" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Start image: none" })).toBeInTheDocument();
  });

  it("seeds a generation even where an edit leaves the samplers alone", async () => {
    const user = userEvent.setup();
    renderDialog(settings({ preset: "i2v" }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(screen.queryByLabelText("Seed")).not.toBeInTheDocument();
    await user.click(within(whatItDoes()).getByRole("radio", { name: "Generate" }));

    expect(screen.getByLabelText("Seed")).toBeEnabled();
  });

  it("cannot edit with a preset that loads nothing", async () => {
    renderDialog(settings({ preset: "txt2img" }));

    await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(within(whatItDoes()).getByRole("radio", { name: "Edit" })).toBeDisabled();
    expect(within(whatItDoes()).getByRole("radio", { name: "Generate" })).toBeChecked();
  });

  it("runs a file's own workflow that loads one from a start image", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(settings(), {
      scope: { ...SCOPE, itemCount: 0 },
      embedded: {
        ...EMBEDDED,
        generation: { ...EMBEDDED.generation, source_kind: "image" },
      },
      folderItems: [START],
    });

    await screen.findByRole("radiogroup", { name: "File workflow" });
    expect(within(whatItDoes()).getByRole("radio", { name: "Edit" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Start image: none" }));
    await user.click(await screen.findByRole("option", { name: "start.png" }));
    await user.click(screen.getByRole("button", { name: "Start workflow" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ generates: true, startPath: START.path }),
    );
  });
});
