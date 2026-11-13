import { IconButton } from "@/shared/ui/IconButton";
import { useCallback, useState } from "react";
import { openFolderInExplorer } from "@/features/folder/api/folders";
import { useFolderPrefetch } from "@/features/folder/hooks/useFolderPrefetch";
import { driveRootOf } from "@/features/folder/lib/drives";
import { formatApiError } from "@/shared/api/http";
import { useCopyFeedback } from "@/shared/hooks/useCopyFeedback";
import { iconArrowUpRight, iconCheck, iconCopy, iconX } from "@/shared/icons";
import type { Breadcrumb } from "@/shared/types";
import { classNames } from "@/shared/lib/classNames";
import { BreadcrumbCrumbMenu } from "./BreadcrumbCrumbMenu";
import { BreadcrumbDriveMenu } from "./BreadcrumbDriveMenu";
import { Tooltip } from "@/shared/ui/Tooltip";

interface BreadcrumbBarProps {
  breadcrumbs: Breadcrumb[];
  currentFolder: string;
  hasSubfolders: boolean;
  folderNotFound?: boolean;
  onNavigate: (path: string) => void;
}

export function BreadcrumbBar({
  breadcrumbs,
  currentFolder,
  hasSubfolders,
  folderNotFound = false,
  onNavigate,
}: BreadcrumbBarProps) {
  const prefetch = useFolderPrefetch();
  const [openingInExplorer, setOpeningInExplorer] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const { copyState, copyLabel, copyText } = useCopyFeedback();

  const handleOpenInExplorer = useCallback(async () => {
    if (openingInExplorer) return;

    setExplorerError(null);
    setOpeningInExplorer(true);

    try {
      await openFolderInExplorer(currentFolder);
    } catch (error) {
      setExplorerError(formatApiError(error));
    } finally {
      setOpeningInExplorer(false);
    }
  }, [currentFolder, openingInExplorer]);

  const handleCopyPath = useCallback(() => {
    if (folderNotFound || !currentFolder) return;
    void copyText(currentFolder);
  }, [copyText, currentFolder, folderNotFound]);

  const copyPathLabel = copyState === "idle" ? "Copy path" : copyLabel;
  const copyPathIcon =
    copyState === "copied" ? iconCheck : copyState === "error" ? iconX : iconCopy;

  if (breadcrumbs.length === 0) return null;

  const currentDrive = driveRootOf(currentFolder);

  return (
    <nav className="breadcrumbs" aria-label="Folder path">
      {currentDrive && <BreadcrumbDriveMenu currentDrive={currentDrive} onNavigate={onNavigate} />}
      <ol className="breadcrumbs__list">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <li key={crumb.path} className="breadcrumbs__item">
              {isLast ? (
                <span
                  className={classNames(
                    "breadcrumbs__current",
                    folderNotFound && "breadcrumbs__current--not-found",
                  )}
                  aria-current="page"
                  title={crumb.path}
                >
                  {crumb.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="breadcrumbs__link"
                  onClick={() => onNavigate(crumb.path)}
                  {...prefetch(crumb.path)}
                  title={crumb.path}
                >
                  {crumb.name}
                </button>
              )}
              {(!isLast || (hasSubfolders && !folderNotFound)) && (
                <BreadcrumbCrumbMenu
                  folderPath={crumb.path}
                  label={crumb.name}
                  activeChildPath={breadcrumbs[index + 1]?.path}
                  onNavigate={onNavigate}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="breadcrumbs__actions">
        <Tooltip
          content={folderNotFound ? "Folder not found" : copyPathLabel}
          open={copyState !== "idle"}
        >
          {/* Its own tooltip, which stays open to confirm the copy. */}
          <IconButton
            icon={copyPathIcon}
            label={copyPathLabel}
            tooltip={false}
            size="sm"
            variant="ghost"
            className={classNames(
              copyState === "copied" && "breadcrumbs__copy--copied",
              copyState === "error" && "breadcrumbs__copy--error",
            )}
            onClick={handleCopyPath}
            disabled={folderNotFound || !currentFolder}
          />
        </Tooltip>

        <IconButton
          icon={iconArrowUpRight}
          label="Open in File Explorer"
          tooltip={folderNotFound ? "Folder not found" : (explorerError ?? "Open in File Explorer")}
          size="sm"
          variant="ghost"
          busy={openingInExplorer}
          onClick={() => {
            void handleOpenInExplorer();
          }}
          disabled={folderNotFound}
        />
      </div>
    </nav>
  );
}
