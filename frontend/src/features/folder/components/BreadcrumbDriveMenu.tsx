import { useQuery } from "@tanstack/react-query";
import { useFolderPrefetch } from "@/features/folder/hooks/useFolderPrefetch";
import { DRIVES_REFRESH_MS, driveIcon, listDrives } from "@/features/folder/lib/drives";
import { folderRootsQueryOptions } from "@/features/folder/lib/folderQuery";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconHardDrive } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";

interface BreadcrumbDriveMenuProps {
  /** Drive root the open folder is on, as `C:\`. */
  currentDrive: string;
  onNavigate: (path: string) => void;
}

export function BreadcrumbDriveMenu({ currentDrive, onNavigate }: BreadcrumbDriveMenuProps) {
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  const prefetch = useFolderPrefetch();

  // Polled, not read on open: whether the button shows at all depends on the list.
  const rootsQuery = useQuery({ ...folderRootsQueryOptions(), refetchInterval: DRIVES_REFRESH_MS });
  const drives = listDrives(rootsQuery.data?.roots ?? []);

  const handleSelect = (path: string) => {
    close();
    onNavigate(path);
  };

  // The current drive may be the one unplugged, which still leaves somewhere to go.
  if (!drives.some((drive) => drive.path !== currentDrive)) return null;

  return (
    <div ref={rootRef} className="breadcrumbs__menu">
      <Tooltip content="Switch drive">
        <button
          type="button"
          className="breadcrumbs__explorer"
          aria-label="Switch drive"
          {...triggerProps}
        >
          <Icon icon={iconHardDrive} className="breadcrumbs__explorer-icon" />
        </button>
      </Tooltip>

      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        placement="bottom-start"
        id={menuId}
        className="breadcrumbs__menu-panel"
        role="menu"
        label="Drives"
      >
        {drives.map((drive) => {
          const isActive = drive.path === currentDrive;
          const name = drive.label ? `${drive.name} ${drive.label}` : drive.name;
          return (
            <button
              key={drive.path}
              type="button"
              role="menuitem"
              className={classNames(
                "breadcrumbs__menu-option",
                isActive && "breadcrumbs__menu-option--active",
              )}
              aria-current={isActive ? "true" : undefined}
              aria-label={name}
              title={name}
              onClick={() => handleSelect(drive.path)}
              {...prefetch(drive.path)}
            >
              <Icon icon={driveIcon(drive.kind)} className="breadcrumbs__menu-option-icon" />
              <span className="breadcrumbs__menu-option-label">
                {drive.name}
                {drive.label && (
                  <span className="breadcrumbs__menu-option-detail"> {drive.label}</span>
                )}
              </span>
            </button>
          );
        })}
      </AnchoredLayer>
    </div>
  );
}
