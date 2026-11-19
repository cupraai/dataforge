import type { ComponentProps, ReactNode } from "react";
import { BreadcrumbBar } from "@/features/folder/components/BreadcrumbBar";
import { Toolbar } from "@/features/gallery/components/Toolbar";
import type { FolderResponse } from "@/shared/types";

type AppHeaderProps = {
  folder: FolderResponse;
  folderNotFound?: boolean;
  refreshing?: boolean;
  /** The background tagger is working through this folder. */
  tagging?: boolean;
  onNavigate: (path?: string) => void;
  toolbarProps: ComponentProps<typeof Toolbar>;
  activity?: ReactNode;
};

export function AppHeader({
  folder,
  folderNotFound,
  refreshing = false,
  tagging = false,
  onNavigate,
  toolbarProps,
  activity,
}: AppHeaderProps) {
  return (
    <header className="app-nav">
      <div className="app-nav__inner">
        <BreadcrumbBar
          breadcrumbs={folder.breadcrumbs}
          currentFolder={folder.path}
          hasSubfolders={folder.subfolder_count > 0}
          folderNotFound={folderNotFound}
          onNavigate={onNavigate}
        />
        <Toolbar {...toolbarProps} />
        {activity}
      </div>
      <FolderActivitySweep refreshing={refreshing} tagging={tagging} />
    </header>
  );
}

/** Tagging wins, so its refreshes never restart the sweep; the keys keep the two apart. */
export function FolderActivitySweep({
  refreshing,
  tagging,
}: {
  refreshing: boolean;
  tagging: boolean;
}) {
  if (tagging) {
    return (
      <div
        key="tagging"
        className="app-nav__refresh app-nav__refresh--tagging"
        role="status"
        aria-label="Tagging folder"
      />
    );
  }
  return (
    refreshing && (
      <div
        key="refreshing"
        className="app-nav__refresh"
        role="status"
        aria-label="Refreshing folder"
      />
    )
  );
}
