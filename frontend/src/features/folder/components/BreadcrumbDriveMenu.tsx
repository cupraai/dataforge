import { IconButton } from "@/shared/ui/IconButton";
import { useQuery } from "@tanstack/react-query";
import { useFolderPrefetch } from "@/features/folder/hooks/useFolderPrefetch";
import {
  DRIVES_REFRESH_MS,
  driveIcon,
  driveRootOf,
  listDrives,
} from "@/features/folder/lib/drives";
import { folderRootsQueryOptions } from "@/features/folder/lib/folderQuery";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconHardDrive } from "@/shared/icons";
import { Menu, MenuItem } from "@/shared/ui/Menu";
import { Tooltip } from "@/shared/ui/Tooltip";

interface BreadcrumbDriveMenuProps {
  currentFolder: string;
  onNavigate: (path: string) => void;
}

export function BreadcrumbDriveMenu({ currentFolder, onNavigate }: BreadcrumbDriveMenuProps) {
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
  const prefetch = useFolderPrefetch();

  // Polled, not read on open: whether the button shows at all depends on the list.
  const rootsQuery = useQuery({ ...folderRootsQueryOptions(), refetchInterval: DRIVES_REFRESH_MS });
  const drives = listDrives(rootsQuery.data?.roots ?? []);
  const currentDrive = driveRootOf(currentFolder, drives);

  const handleSelect = (path: string) => {
    close();
    onNavigate(path);
  };

  // The current drive may be the one unplugged, which still leaves somewhere to go.
  if (!drives.some((drive) => drive.path !== currentDrive)) return null;

  return (
    <div ref={rootRef} className="breadcrumbs__menu">
      <IconButton
        icon={iconHardDrive}
        label="Switch drive"
        size="sm"
        variant="ghost"
        {...triggerProps}
      />

      <Menu menu={menu} label="Drives" placement="bottom-start" className="breadcrumbs__menu-panel">
        {drives.map((drive) => {
          const isActive = drive.path === currentDrive;
          const name = drive.label ? `${drive.name} ${drive.label}` : drive.name;
          // A volume's name says little about where it is mounted; a drive letter says it all.
          const mount = drive.path.startsWith("/") ? drive.path : undefined;
          return (
            <Tooltip key={drive.path} content={mount} placement="right">
              <MenuItem
                icon={driveIcon(drive.kind)}
                label={
                  <>
                    {drive.name}
                    {drive.label && (
                      <span className="breadcrumbs__drive-label"> {drive.label}</span>
                    )}
                  </>
                }
                current={isActive}
                aria-label={name}
                onSelect={() => handleSelect(drive.path)}
                {...prefetch(drive.path)}
              />
            </Tooltip>
          );
        })}
      </Menu>
    </div>
  );
}
