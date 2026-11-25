import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ThumbnailProvider } from "@/features/gallery/context/ThumbnailProvider";
import { iconSearch } from "@/shared/icons";
import type { GalleryDisplayMode, GalleryItem } from "@/shared/types";
import { homeFolder } from "@/test/fixtures";
import { withGallerySelection } from "@/test/gallerySelection";
import { renderWithQueryClient } from "@/test/queryClient";
import { AppFolderContent } from "./AppFolderContent";

function renderContent(displayMode: GalleryDisplayMode, items: GalleryItem[] = homeFolder.items) {
  return renderWithQueryClient(
    withGallerySelection(
      <ThumbnailProvider>
        <main className="main">
          <AppFolderContent
            error={null}
            loading={false}
            folder={homeFolder}
            subfolders={[]}
            filteredSubfolders={[]}
            onNavigate={vi.fn<(path: string) => void>()}
            items={items}
            filteredItems={items}
            filterEmptyState={{
              icon: iconSearch,
              title: "No matches",
              description: "",
              variant: "muted",
            }}
            onOpenGalleryItem={vi.fn<(path: string) => void>()}
            displayMode={displayMode}
            onDisplayModeChange={vi.fn<(mode: GalleryDisplayMode) => void>()}
            fileDrop={{
              enabled: false,
              active: false,
              folderLabel: "",
              onDragEnter: vi.fn<(event: React.DragEvent) => void>(),
              onDragOver: vi.fn<(event: React.DragEvent) => void>(),
              onDragLeave: vi.fn<(event: React.DragEvent) => void>(),
              onDrop: vi.fn<(event: React.DragEvent) => void>(),
            }}
          />
        </main>
      </ThumbnailProvider>,
    ),
  );
}

describe("AppFolderContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("docks the list's column headings in the sticky Media header", () => {
    const { container } = renderContent("list");

    const section = container.querySelector<HTMLElement>(".gallery-section");
    const headings = container.querySelector(".gallery-section__header .gallery-list-header");
    expect(headings).toHaveTextContent(/Name.*Caption/);
    // The headings and the rows read their widths from the section that holds both.
    expect(section?.style.getPropertyValue("--gallery-list-col-status")).not.toBe("");
    expect(section?.querySelectorAll(".gallery-list-row")).toHaveLength(homeFolder.items.length);
  });

  it("heads no columns over cards", () => {
    const { container } = renderContent("small");

    expect(container.querySelector(".gallery-list-header")).toBeNull();
    expect(container.querySelector(".gallery-section__header--with-below")).toBeNull();
    expect(
      container
        .querySelector<HTMLElement>(".gallery-section")
        ?.style.getPropertyValue("--gallery-list-col-status"),
    ).toBe("");
  });

  it("switches card badges from the menu beside the display mode, and saves the choice", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const items = homeFolder.items.map((item) => ({ ...item, has_candidate: true }));
    const { container } = renderContent("small", items);

    expect(container.querySelector(".card__badge--candidate")).toHaveTextContent("Candidate");

    await user.click(screen.getByRole("button", { name: "Card badges" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Hidden/ }));

    expect(container.querySelector(".card__badge")).toBeNull();
    const save = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(save?.[1]?.body)).gallery_cards.badges).toBe("hidden");
  });

  it("offers no badge menu in list view", () => {
    renderContent("list");

    expect(screen.queryByRole("button", { name: "Card badges" })).toBeNull();
    expect(screen.getByRole("button", { name: "Display mode" })).toBeInTheDocument();
  });
});
