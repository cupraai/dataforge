import { describe, expect, it, vi } from "vite-plus/test";
import { ThumbnailProvider } from "@/features/gallery/context/ThumbnailProvider";
import { iconSearch } from "@/shared/icons";
import type { GalleryDisplayMode } from "@/shared/types";
import { homeFolder } from "@/test/fixtures";
import { withGallerySelection } from "@/test/gallerySelection";
import { renderWithQueryClient } from "@/test/queryClient";
import { AppFolderContent } from "./AppFolderContent";

function renderContent(displayMode: GalleryDisplayMode) {
  const items = homeFolder.items;
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
});
