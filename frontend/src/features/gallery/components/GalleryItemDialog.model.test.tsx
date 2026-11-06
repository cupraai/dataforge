import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PATH } from "@/test/fixtures";
import { makeItem } from "@/test/galleryItemDialog";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithProviders } from "@/test/renderWithProviders";
import * as captionsApi from "@/features/gallery/api/captions";
import * as modelInfoApi from "@/features/gallery/api/modelInfo";
import { GalleryItemDialog } from "./GalleryItemDialog";
import type { CaptionSaveResponse, GalleryItem, ModelInfoResponse } from "@/shared/types";

vi.mock("@/shared/lib/defer", () => ({
  deferNonCriticalWork: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

vi.mock("@/features/gallery/api/modelInfo", () => ({
  fetchModelInfo: vi.fn<typeof modelInfoApi.fetchModelInfo>(),
}));

const fetchModelInfoMock = vi.mocked(modelInfoApi.fetchModelInfo);

function modelItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return makeItem("subject_000001500.safetensors", {
    media_type: "model",
    description: null,
    has_description: false,
    has_caption_file: false,
    caption_status: "none",
    width: null,
    height: null,
    size: 150 * 1024 ** 2,
    ...overrides,
  });
}

const INFO: ModelInfoResponse = {
  path: `${HOME_PATH}\\subject_000001500.safetensors`,
  metadata: {
    name: "subject_lora",
    training_info: '{"step": 1500, "epoch": 3}',
  },
  tensor_count: 480,
  parameter_count: 18_874_368,
  precision: "BF16",
  architecture: "qwen_image",
  title: "subject_lora",
  kind: "lora",
  rank: 16,
  alpha: null,
  step: 1500,
  epoch: 3,
  trigger_words: ["ohwx"],
  software: "ai-toolkit 0.7.0",
};

function renderDialog(item: GalleryItem) {
  return renderWithProviders(
    <GalleryItemDialog
      items={[item]}
      index={0}
      onClose={vi.fn<() => void>()}
      onPrevious={vi.fn<() => void>()}
      onNext={vi.fn<() => void>()}
      onCaptionSaved={vi.fn<(path: string, update: CaptionSaveResponse) => void>()}
      currentFolder={HOME_PATH}
      hasCaptionBackup
    />,
  );
}

describe("GalleryItemDialog for a model file", () => {
  beforeEach(() => {
    installMockBackend();
    fetchModelInfoMock.mockReset();
  });

  it("shows the header facts and metadata instead of media and a caption", async () => {
    const fetchCaption = vi.spyOn(captionsApi, "fetchCaption");
    const fetchBackup = vi.spyOn(captionsApi, "fetchCaptionBackup");
    fetchModelInfoMock.mockResolvedValue(INFO);

    renderDialog(modelItem());

    const dialog = await screen.findByRole("dialog", {
      name: "Viewing subject_000001500.safetensors",
    });
    const facts = await within(dialog).findByRole("group", {
      name: "Model details for subject_000001500.safetensors",
    });
    expect(within(facts).getByText("subject_lora")).toBeInTheDocument();
    const badges = within(within(facts).getByRole("list", { name: "Model type" })).getAllByRole(
      "listitem",
    );
    expect(badges.map((badge) => badge.textContent)).toEqual(["LoRA", "qwen_image", "BF16"]);
    expect(within(facts).getByText("Rank").nextSibling).toHaveTextContent("16");
    expect(within(facts).getByText("Step").nextSibling).toHaveTextContent("1,500");
    expect(within(facts).getByText("Parameters").nextSibling).toHaveTextContent("18.9M");
    expect(
      within(facts).getByRole("button", { name: "Copy the trigger word ohwx" }),
    ).toBeInTheDocument();

    // A JSON value stays one line until opened.
    const metadata = within(dialog).getByRole("region", {
      name: "Metadata of subject_000001500.safetensors",
    });
    expect(within(metadata).getByText("training_info")).toBeInTheDocument();
    expect(within(metadata).getByText("{ step, epoch }")).toBeInTheDocument();

    // The weights are never loaded as an image, and no caption is read or offered.
    expect(dialog.querySelector(".gallery-item-dialog__img")).toBeNull();
    expect(within(dialog).queryByLabelText(/Caption for/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Open in image preview" }),
    ).not.toBeInTheDocument();
    expect(fetchCaption).not.toHaveBeenCalled();
    expect(fetchBackup).not.toHaveBeenCalled();
    expect(fetchModelInfoMock).toHaveBeenCalledWith(INFO.path);
  });

  it("copies a trigger word and the whole metadata", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    fetchModelInfoMock.mockResolvedValue(INFO);

    renderDialog(modelItem());

    await user.click(await screen.findByRole("button", { name: "Copy the trigger word ohwx" }));
    expect(writeText).toHaveBeenLastCalledWith("ohwx");
    expect(await screen.findByRole("button", { name: "Copied ohwx" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Copy the metadata of subject_000001500.safetensors as JSON",
      }),
    );
    // Embedded JSON strings are unpacked, so the copy reads as one document.
    expect(JSON.parse(writeText.mock.lastCall![0])).toEqual({
      name: "subject_lora",
      training_info: { step: 1500, epoch: 3 },
    });
  });

  it("draws the listed kind before the header is read", async () => {
    fetchModelInfoMock.mockReturnValue(new Promise(() => {}));

    renderDialog(modelItem({ model_kind: "text_encoder" }));

    const facts = await screen.findByRole("group", {
      name: "Model details for subject_000001500.safetensors",
    });
    // The workflow map's CLIP hue.
    expect(facts).toHaveClass("model-tone--clip");
  });

  it("says why when the header cannot be read", async () => {
    fetchModelInfoMock.mockRejectedValue(new Error("Could not read this file's header"));

    renderDialog(modelItem());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not read this file's header");
    });
  });
});
