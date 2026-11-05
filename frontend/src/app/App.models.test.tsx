import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HOME_PATH, homeFolder, mediaItem } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderApp } from "@/test/renderApp";
import * as modelInfoApi from "@/features/gallery/api/modelInfo";
import type { FolderResponse, ModelInfoResponse } from "@/shared/types";

vi.mock("@/features/gallery/api/modelInfo", () => ({
  fetchModelInfo: vi.fn<typeof modelInfoApi.fetchModelInfo>(),
}));

function model(name: string) {
  return mediaItem(name, HOME_PATH, { width: null, height: null, size: 150 * 1024 ** 2 });
}

const modelFolder: FolderResponse = {
  ...homeFolder,
  items: [
    ...homeFolder.items,
    model("subject_000001000.safetensors"),
    model("subject_000002000.safetensors"),
  ],
};

function info(path: string): ModelInfoResponse {
  return {
    path,
    metadata: {},
    tensor_count: 2,
    parameter_count: 1024,
    precision: "BF16",
    adapter: "lora",
    rank: 16,
    trigger_words: [],
  };
}

describe("model files", () => {
  it("are listed in their own section, not among the media", async () => {
    installMockBackend({ folderByPath: { undefined: modelFolder, [HOME_PATH]: modelFolder } });
    renderApp();

    const models = await screen.findByRole("region", { name: "Models" });
    expect(
      within(models).getByRole("button", { name: "Open the model subject_000001000.safetensors" }),
    ).toBeInTheDocument();
    expect(within(models).getAllByRole("button", { name: /^Open the model/ })).toHaveLength(2);

    const media = screen.getByRole("region", { name: "Media" });
    expect(within(media).getByRole("button", { name: "View sunset.png" })).toBeInTheDocument();
    expect(within(media).queryByText(/\.safetensors$/)).not.toBeInTheDocument();
  });

  it("follow the toolbar's search and sort", async () => {
    const user = userEvent.setup();
    const folder: FolderResponse = {
      ...homeFolder,
      items: [
        ...homeFolder.items,
        { ...model("style_final.safetensors"), modified_at: "2026-03-01T10:00:00.000Z" },
        { ...model("subject_early.safetensors"), modified_at: "2026-03-10T10:00:00.000Z" },
        { ...model("subject_late.safetensors"), modified_at: "2026-03-20T10:00:00.000Z" },
      ],
    };
    installMockBackend({ folderByPath: { undefined: folder, [HOME_PATH]: folder } });
    renderApp();

    const models = await screen.findByRole("region", { name: "Models" });
    const shown = () =>
      within(models)
        .queryAllByRole("button", { name: /^Open the model/ })
        .map((card) => card.getAttribute("aria-label")!.replace("Open the model ", ""));
    // The gallery opens newest first.
    expect(shown()).toEqual([
      "subject_late.safetensors",
      "subject_early.safetensors",
      "style_final.safetensors",
    ]);

    await user.click(screen.getByRole("button", { name: "Sort media" }));
    await user.click(
      within(screen.getByRole("menu", { name: "Sort" })).getByRole("menuitemradio", {
        name: "Name",
      }),
    );
    await waitFor(() => {
      expect(shown()).toEqual([
        "style_final.safetensors",
        "subject_early.safetensors",
        "subject_late.safetensors",
      ]);
    });

    await user.type(
      screen.getByRole("searchbox", { name: "Search files and folders by name, caption or tag" }),
      "subject",
    );
    await waitFor(() => {
      expect(shown()).toEqual(["subject_early.safetensors", "subject_late.safetensors"]);
    });
  });

  it("open in the inspector even when the expanded view is saved", async () => {
    const user = userEvent.setup();
    localStorage.setItem("gallery-focus-view", "true");
    vi.mocked(modelInfoApi.fetchModelInfo).mockImplementation(async (path) => info(path));
    installMockBackend({ folderByPath: { undefined: modelFolder, [HOME_PATH]: modelFolder } });
    renderApp();

    await user.click(
      await screen.findByRole("button", {
        name: "Open the model subject_000001000.safetensors",
      }),
    );

    const inspector = await screen.findByRole("complementary", {
      name: "Viewing subject_000001000.safetensors",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      within(inspector).queryByRole("button", { name: /Expand media view|Minimize/ }),
    ).not.toBeInTheDocument();
    // Its card is outlined like an inspected gallery card; the other model's is not.
    const models = screen.getByRole("region", { name: "Models" });
    expect(
      within(models).getByRole("button", { name: "Open the model subject_000001000.safetensors" }),
    ).toHaveAttribute("data-inspected");
    expect(
      within(models).getByRole("button", { name: "Open the model subject_000002000.safetensors" }),
    ).not.toHaveAttribute("data-inspected");

    // The saved layout is left as it was for the media.
    expect(localStorage.getItem("gallery-focus-view")).toBe("true");
    localStorage.removeItem("gallery-focus-view");
  });

  it("open in the item dialog, which pages through the models alone", async () => {
    const user = userEvent.setup();
    vi.mocked(modelInfoApi.fetchModelInfo).mockImplementation(async (path) => info(path));
    installMockBackend({ folderByPath: { undefined: modelFolder, [HOME_PATH]: modelFolder } });
    renderApp();

    await user.click(
      await screen.findByRole("button", {
        name: "Open the model subject_000002000.safetensors",
      }),
    );

    const dialog = await screen.findByRole("complementary", {
      name: "Viewing subject_000002000.safetensors",
    });
    expect(
      await within(dialog).findByRole("group", {
        name: "Model details for subject_000002000.safetensors",
      }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Next item" }));

    // The next item wraps to the other model, never to the folder's images.
    await waitFor(() => {
      expect(
        screen.getByRole("complementary", { name: "Viewing subject_000001000.safetensors" }),
      ).toBeInTheDocument();
    });
  });
});
