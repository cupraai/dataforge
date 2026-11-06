import { normalizeFolderPath } from "@/features/folder/lib/folderPath";
import { iconDisc, iconHardDrive, iconNetwork, iconUsb, type AppIcon } from "@/shared/icons";
import type { FolderRoot, FolderRootKind } from "@/shared/types";

/** How often the drive list is re-read while the app is visible, so a plugged-in drive shows. */
export const DRIVES_REFRESH_MS = 5000;

export interface Drive {
  /** The letter and colon, as `D:`. */
  name: string;
  /** The drive root, as `D:\`. */
  path: string;
  kind: FolderRootKind;
  label: string | null;
}

const DRIVE_ROOT = /^([A-Za-z]:)\\$/;

/** The Windows drives among the folder roots; Home and the POSIX root are not drives. */
export function listDrives(roots: FolderRoot[]): Drive[] {
  return roots.flatMap((root) => {
    const path = normalizeFolderPath(root.path);
    const match = DRIVE_ROOT.exec(path);
    return match ? [{ name: match[1], path, kind: root.kind, label: root.label ?? null }] : [];
  });
}

/** The drive root a Windows path is on, as `D:\`; null for any other path. */
export function driveRootOf(path: string): string | null {
  const letter = /^([A-Za-z]):(?:[\\/]|$)/.exec(path.trim())?.[1];
  return letter ? `${letter.toUpperCase()}:\\` : null;
}

export function driveIcon(kind: FolderRootKind): AppIcon {
  switch (kind) {
    case "removable":
      return iconUsb;
    case "network":
      return iconNetwork;
    case "optical":
      return iconDisc;
    default:
      return iconHardDrive;
  }
}
