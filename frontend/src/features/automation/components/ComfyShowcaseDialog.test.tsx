import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchComfyPresets } from "@/features/automation/api/jobs";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import type {
  ComfyPresetSummary,
  ComfyShowcaseJobSettings,
  GalleryItem,
  Job,
} from "@/shared/types";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithQueryClient } from "@/test/queryClient";
import { ComfyShowcaseDialog } from "./ComfyShowcaseDialog";

vi.mock("@/features/automation/api/jobs", () => ({
  fetchComfyPresets: vi.fn<typeof fetchComfyPresets>(),
}));

const fetchPresets = vi.mocked(fetchComfyPresets);

const FOLDER = "/renders/showcase";
const SCOPE = { itemCount: 0, folderLabel: "showcase", kind: "destination" as const };
const FIRST = "LORAS/subject_000001000.safetensors";
const SECOND = "LORAS/subject_000001500.safetensors";

function preset(name: string, overrides: Partial<ComfyPresetSummary> = {}): ComfyPresetSummary {
  return {
    name,
    modified_at: null,
    accepts_prompt: true,
    accepts_seed: true,
    inputs: [],
    generates: true,
    accepts_loras: true,
    source_kind: null,
    accepts_generation_seed: true,
    ...overrides,
  };
}

function settings(
  overrides: Partial<JobSettingsByType["comfy_showcase"]> = {},
): JobSettingsByType["comfy_showcase"] {
  return {
    preset: "t2i",
    items: [],
    subject_loras: [],
    name_prefix: "",
    caption_from_prompt: false,
    make_sheet: false,
    ...overrides,
  };
}

function trainingJob(folder: string): Job {
  return {
    id: "train-1",
    folder,
    folder_name: "dataset",
    job_type: "train_lora",
    status: "completed",
    effective_status: "completed",
    total: 1000,
    processed: 1000,
    stats: {},
    created_at: "2026-11-20T10:00:00Z",
    revision: 1,
    workflow_edited: false,
    generates: false,
    undoable: false,
    external_ref: "subject",
  };
}

function renderDialog(
  initialSettings = settings(),
  folderItems: GalleryItem[] = [],
): { onConfirm: ReturnType<typeof vi.fn<(body: ComfyShowcaseJobSettings) => void>> } {
  const onConfirm = vi.fn<(body: ComfyShowcaseJobSettings) => void>();
  renderWithQueryClient(
    <ComfyShowcaseDialog
      scope={SCOPE}
      initialSettings={initialSettings}
      folderPath={FOLDER}
      folderItems={folderItems}
      onConfirm={onConfirm}
      onCancel={vi.fn<() => void>()}
    />,
  );
  return { onConfirm };
}

async function start(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("radio", { name: "t2i" });
  await user.click(screen.getByRole("button", { name: "Start showcase" }));
}

describe("ComfyShowcaseDialog", () => {
  beforeEach(() => {
    fetchPresets.mockReset().mockResolvedValue({
      presets: [
        preset("t2i"),
        preset("i2v", { generates: false, source_kind: "image", accepts_seed: false }),
        preset("upscale", { generates: false, accepts_loras: false }),
      ],
      available: true,
      base_url: "http://127.0.0.1:9000",
    });
  });

  it("lists only presets it can add LoRAs to", async () => {
    installMockBackend();
    renderDialog();

    const list = await screen.findByRole("radiogroup", { name: "Workflow presets" });
    expect(within(list).getByRole("radio", { name: "i2v" })).toHaveAccessibleDescription(
      "Prompt · Start image",
    );
    expect(within(list).queryByRole("radio", { name: "upscale" })).not.toBeInTheDocument();
  });

  it("frames the selected item and its extra LoRAs, each saying what an empty field runs", async () => {
    installMockBackend();
    renderDialog();

    await screen.findByRole("radio", { name: "t2i" });

    const item = screen.getByRole("group", { name: "Item 1" });
    expect(within(item).getByLabelText("Prompt")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Empty runs the saved prompt."),
    );
    expect(within(item).getByLabelText("Seed")).toHaveAttribute("placeholder", "Random");
    const loras = screen.getByRole("group", { name: "More LoRAs" });
    expect(within(loras).getByText("Only the showcased LoRA runs for this item.")).toBeVisible();
    expect(within(loras).getByRole("button", { name: "Add LoRA" })).toBeEnabled();
    // One seed for every LoRA compared is said once, for the whole showcase.
    expect(screen.getByText(/with the same seed/)).toBeInTheDocument();
  });

  it("asks for the LoRA before it starts", async () => {
    installMockBackend();
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await start(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose the LoRA to showcase.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("starts every item with the LoRAs compared", async () => {
    installMockBackend();
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(
      settings({
        items: [
          {
            label: "Beach",
            enabled: true,
            prompt_text: "a beach",
            subject_strength: 0.8,
            loras: [{ name: "style.safetensors", strength: 0.5, enabled: true }],
            seed: 42,
            inputs: {},
            source_path: null,
          },
        ],
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Choose the LoRA to showcase" }));
    await user.click(await screen.findByRole("option", { name: /^subject_000001000/ }));
    await user.click(screen.getByRole("button", { name: "Add a LoRA to compare" }));
    await user.click(await screen.findByRole("option", { name: /^subject_000001500/ }));

    expect(screen.getByText("step 1000")).toBeInTheDocument();
    expect(screen.getByText("1 item × 2 LoRAs = 2 generations")).toBeInTheDocument();

    await start(user);

    expect(onConfirm).toHaveBeenCalledWith({
      preset: "t2i",
      items: [
        {
          label: "Beach",
          enabled: true,
          prompt_text: "a beach",
          subject_strength: 0.8,
          loras: [{ name: "style.safetensors", strength: 0.5, enabled: true }],
          seed: 42,
          inputs: {},
          source_path: null,
        },
      ],
      subject_loras: [FIRST, SECOND],
      name_prefix: "",
      caption_from_prompt: false,
      make_sheet: false,
    });
  });

  it("adds, duplicates and turns off items, counting only those that render", async () => {
    installMockBackend();
    const user = userEvent.setup();
    renderDialog(settings({ subject_loras: [FIRST] }));

    await screen.findByRole("radio", { name: "t2i" });
    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "a cat");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^\d\. a cat$/ })).toHaveLength(2);

    await user.click(screen.getByRole("checkbox", { name: "Render item 3" }));
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("selects the item whose field does not parse", async () => {
    installMockBackend();
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(settings({ subject_loras: [FIRST] }));

    await screen.findByRole("radio", { name: "t2i" });
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.click(screen.getByRole("button", { name: /^1\. Item 1$/ }));
    const strength = screen.getByRole("spinbutton", { name: "Strength" });
    await user.clear(strength);
    await user.type(strength, "20");
    await user.click(screen.getByRole("button", { name: /^2\. Item 2$/ }));
    await start(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/^Item 1: the LoRA strength/);
    expect(screen.getByRole("button", { name: /^1\. Item 1$/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("drops a message once the draft it was about is edited", async () => {
    installMockBackend();
    const user = userEvent.setup();
    renderDialog();

    await start(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "a");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves and loads a set without a LoRA chosen", async () => {
    const { requestsTo } = installMockBackend();
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("radio", { name: "t2i" });
    const prompt = screen.getByRole("textbox", { name: "Prompt" });
    await user.type(prompt, "a beach");
    await user.click(screen.getByRole("button", { name: "Sets" }));
    const panel = await screen.findByRole("dialog", { name: "Showcase sets" });
    await user.click(within(panel).getByRole("button", { name: "Save these items..." }));
    await user.type(within(panel).getByLabelText("Name for the set"), "Places{Enter}");
    const saved = await within(panel).findByRole("button", { name: /^Places.*t2i · 1 item$/ });
    expect(requestsTo("/api/automation/comfy-showcase/sets", "PUT")).toHaveLength(1);

    await user.clear(prompt);
    await user.click(saved);
    expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveValue("a beach");
  });

  it("starts without a start image, and can drop one again", async () => {
    installMockBackend();
    const user = userEvent.setup();
    const image = { path: `${FOLDER}/start.png`, name: "start.png", media_type: "image" };
    const { onConfirm } = renderDialog(settings({ preset: "i2v", subject_loras: [FIRST] }), [
      image as GalleryItem,
    ]);

    await start(user);
    expect(onConfirm.mock.lastCall?.[0].items[0].source_path).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove start image" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start image: none" }));
    await user.click(await screen.findByRole("option", { name: "start.png" }));
    await start(user);
    expect(onConfirm.mock.lastCall?.[0].items[0].source_path).toBe(`${FOLDER}/start.png`);

    await user.click(screen.getByRole("button", { name: "Remove start image" }));
    expect(screen.getByRole("button", { name: "Start image: none" })).toHaveFocus();
    await start(user);
    expect(onConfirm.mock.lastCall?.[0].items[0].source_path).toBeNull();
  });

  it("makes a sheet of items and LoRAs on request", async () => {
    installMockBackend();
    const user = userEvent.setup();
    const { onConfirm } = renderDialog(settings({ subject_loras: [FIRST, SECOND] }));

    const sheet = screen.getByRole("checkbox", { name: "Make a showcase sheet" });
    expect(sheet).not.toBeChecked();
    expect(sheet).toHaveAccessibleDescription("1 item down, 2 LoRAs across");
    await user.click(sheet);
    await start(user);

    expect(onConfirm.mock.calls[0][0].make_sheet).toBe(true);
  });

  it("warns when a LoRA was trained on the folder the files would land in", async () => {
    installMockBackend({ jobs: [trainingJob("/renders")] });
    renderDialog(settings({ subject_loras: [FIRST] }));

    expect(await screen.findByRole("note")).toHaveTextContent(
      "subject trained on this folder, and AI-Toolkit trains on every file in it",
    );
  });
});
