import { Button } from "@/shared/ui/Button";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { FolderErrorState } from "@/features/folder/components/FolderErrorState";
import { FolderLoadingState } from "@/features/folder/components/FolderLoadingState";
import { FolderGrid } from "@/features/folder/components/FolderGrid";
import type { FolderDropZone } from "@/features/folder/hooks/useFolderFileDrop";
import { Gallery } from "@/features/gallery/components/Gallery";
import { GalleryBadgeMenu } from "@/features/gallery/components/GalleryBadgeMenu";
import { GalleryDisplayMenu } from "@/features/gallery/components/GalleryDisplayMenu";
import { GalleryListHeader } from "@/features/gallery/components/GalleryListHeader";
import { ModelGrid } from "@/features/gallery/components/ModelGrid";
import { GalleryFileDropOverlay } from "@/features/gallery/components/GalleryFileDropOverlay";
import { GallerySelectionControls } from "@/features/gallery/components/GallerySelectionControls";
import { useGallerySelectionContext } from "@/features/gallery/context/GallerySelectionContext";
import { useGalleryListColumns } from "@/features/gallery/hooks/useGalleryListColumns";
import type { FilterEmptyState } from "@/features/gallery/lib/filters";
import type { FolderError } from "@/shared/api/http";
import { iconCheck, iconFolderOpen, iconImages, iconPencilLine, iconTrash2 } from "@/shared/icons";
import { useUiSettings, useUpdateUiSettings } from "@/shared/preferences/uiPreferences";
import type { FolderResponse, GalleryDisplayMode, GalleryItem, Subfolder } from "@/shared/types";
import { classNames } from "@/shared/lib/classNames";
import { EmptyState } from "@/shared/ui/EmptyState";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { VideoProjectGrid } from "@/features/videoEditor/components/VideoProjectGrid";
import { useFolderEntrance } from "@/app/hooks/useFolderEntrance";
import { AppInitialLoading } from "./AppInitialLoading";

type AppFolderContentProps = {
  error: FolderError | null;
  loading: boolean;
  folder: FolderResponse | null;
  subfolders: Subfolder[];
  filteredSubfolders: Subfolder[];
  onNavigate: (path: string) => void;
  /** Set only while the open folder has no media and no subfolders. */
  onRenameFolder?: () => void;
  onDeleteFolder?: () => void;
  items: GalleryItem[];
  filteredItems: GalleryItem[];
  /** Model files, shown in their own section; opening one pages through the others. */
  models?: GalleryItem[];
  filteredModels?: GalleryItem[];
  filterEmptyState: FilterEmptyState;
  /** The search and filter summary, shown at the start of the Media header actions. */
  activeFilters?: ReactNode;
  onOpenGalleryItem: (path: string) => void;
  /** Opens a saved editor draft; the drafts section is left out without it. */
  onOpenVideoProject?: (projectPath: string) => void;
  searchQuery?: string;
  displayMode: GalleryDisplayMode;
  onDisplayModeChange: (value: GalleryDisplayMode) => void;
  fileDrop: FolderDropZone;
};

export function AppFolderContent({
  error,
  loading,
  folder,
  subfolders,
  filteredSubfolders,
  onNavigate,
  onRenameFolder,
  onDeleteFolder,
  items,
  filteredItems,
  models = [],
  filteredModels = models,
  filterEmptyState,
  activeFilters,
  onOpenGalleryItem,
  onOpenVideoProject,
  searchQuery = "",
  displayMode,
  onDisplayModeChange,
  fileDrop,
}: AppFolderContentProps) {
  const { selectionMode, visibleSelectedCount } = useGallerySelectionContext();
  const { galleryCards: savedCards, taggingEnabled } = useUiSettings();
  const updateUiSettings = useUpdateUiSettings();
  // Listings carry no tags while tagging is off; this hides them before the re-read lands.
  const galleryCards = useMemo(
    () => (taggingEnabled ? savedCards : { ...savedCards, largeTags: false }),
    [savedCards, taggingEnabled],
  );
  const showListHeader = displayMode === "list" && filteredItems.length > 0;
  // On the section, so the headings in its sticky header and the rows below share the widths.
  const [mediaSection, setMediaSection] = useState<HTMLElement | null>(null);
  const listColumns = useGalleryListColumns(mediaSection, filteredItems, showListHeader);
  const contentRef = useRef<HTMLDivElement>(null);
  // Keyed on loading too: a folder that shows its skeleton first enters when the content mounts.
  useFolderEntrance(contentRef, `${folder?.path ?? ""}:${loading}`);
  const folderNotFound = error?.kind === "folder-not-found";
  const globalError = error?.kind === "other" ? error : null;
  const showEmptyFolder = !error && items.length === 0 && models.length === 0;
  // A folder of models alone has nothing for the media section to say.
  const showMediaSection = items.length > 0 || models.length === 0;
  const showFilterEmptyState = !error && filteredItems.length === 0 && !showEmptyFolder;
  const emptyFolderDescription =
    subfolders.length > 0
      ? "This folder has no supported image/video files. Drop compatible files here to import them."
      : "This folder has no subfolders or supported image/video files. Drop compatible files here to import them.";

  return (
    <>
      {globalError && <FolderErrorState error={globalError} />}

      {loading && !folder && <AppInitialLoading />}

      {folder &&
        (loading ? (
          <FolderLoadingState />
        ) : (
          <div
            className={classNames(
              "gallery-drop-zone",
              fileDrop.active && "gallery-drop-zone--active",
            )}
            onDragEnter={fileDrop.enabled ? fileDrop.onDragEnter : undefined}
            onDragOver={fileDrop.enabled ? fileDrop.onDragOver : undefined}
            onDragLeave={fileDrop.enabled ? fileDrop.onDragLeave : undefined}
            onDrop={fileDrop.enabled ? fileDrop.onDrop : undefined}
          >
            <div ref={contentRef} className="gallery-drop-zone__content">
              {!folderNotFound && subfolders.length > 0 && (
                <FolderGrid
                  key={folder.path}
                  folderPath={folder.path}
                  folders={filteredSubfolders}
                  totalCount={subfolders.length}
                  onOpen={onNavigate}
                />
              )}
              {!folderNotFound && onOpenVideoProject && (
                <VideoProjectGrid
                  folderPath={folder.path}
                  fingerprint={folder.fingerprint}
                  searchQuery={searchQuery}
                  onOpen={onOpenVideoProject}
                />
              )}
              {!folderNotFound && (
                <ModelGrid models={models} shown={filteredModels} onOpen={onOpenGalleryItem} />
              )}
              {!folderNotFound && showMediaSection && (
                <section
                  ref={setMediaSection}
                  className="gallery-section"
                  style={listColumns}
                  aria-label="Media"
                >
                  <SectionHeader
                    section="gallery"
                    icon={iconImages}
                    title="Media"
                    count={selectionMode ? visibleSelectedCount : filteredItems.length}
                    total={selectionMode ? filteredItems.length : items.length}
                    alwaysShowTotal={selectionMode}
                    countIcon={selectionMode ? iconCheck : undefined}
                    sticky
                    actions={
                      items.length > 0 ? (
                        <div className="gallery-section__actions">
                          {activeFilters}
                          {filteredItems.length > 0 && (
                            <GallerySelectionControls totalCount={filteredItems.length} />
                          )}
                          {displayMode !== "list" && (
                            <GalleryBadgeMenu
                              value={savedCards.badges}
                              onChange={(badges) =>
                                updateUiSettings({ galleryCards: { ...savedCards, badges } })
                              }
                            />
                          )}
                          <GalleryDisplayMenu value={displayMode} onChange={onDisplayModeChange} />
                        </div>
                      ) : undefined
                    }
                    below={
                      showListHeader ? (
                        <GalleryListHeader selectionMode={selectionMode} />
                      ) : undefined
                    }
                  />

                  {filteredItems.length > 0 ? (
                    <Gallery
                      items={filteredItems}
                      onSelect={onOpenGalleryItem}
                      displayMode={displayMode}
                      cardOptions={galleryCards}
                    />
                  ) : showEmptyFolder ? (
                    <EmptyState
                      icon={iconFolderOpen}
                      title="Empty folder"
                      description={emptyFolderDescription}
                      variant="muted"
                      action={
                        <>
                          {onRenameFolder && (
                            <Button icon={iconPencilLine} onClick={onRenameFolder}>
                              Rename folder
                            </Button>
                          )}
                          {onDeleteFolder && (
                            <Button icon={iconTrash2} onClick={onDeleteFolder}>
                              Delete folder
                            </Button>
                          )}
                        </>
                      }
                    />
                  ) : showFilterEmptyState ? (
                    <EmptyState
                      icon={filterEmptyState.icon}
                      title={filterEmptyState.title}
                      description={filterEmptyState.description}
                      variant={filterEmptyState.variant}
                    />
                  ) : null}
                </section>
              )}

              {error?.kind === "folder-not-found" && (
                <FolderErrorState error={error} folderPath={folder?.path} />
              )}
            </div>

            {fileDrop.enabled && (
              <GalleryFileDropOverlay
                visible={fileDrop.active}
                folderLabel={fileDrop.folderLabel}
              />
            )}
          </div>
        ))}
    </>
  );
}
