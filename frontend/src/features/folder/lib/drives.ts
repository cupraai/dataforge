import { normalizeFolderPath } from "@/features/folder/lib/folderPath";
import { POSIX_VOLUME_PARENTS } from "@/shared/constants";
import { iconDisc, iconHardDrive, iconNetwork, iconUsb, type AppIcon } from "@/shared/icons";
import type { FolderRoot, FolderRootKind } from "@/shared/types";

/** How often the drive list is re-read while the app is visible, so a plugged-in drive shows. */
export const DRIVES_REFRESH_MS = 5000;

export interface Drive {
  /** The letter and colon, as `D:`; on Linux and macOS the volume's name, or `/`. */
  name: string;
  /** The drive root, as `D:\`, or where the volume is mounted. */
  path: string;
  kind: FolderRootKind;
  label: string | null;
}

const DRIVE_ROOT = /^([A-Za-z]:)\\$/;

/**
 * Windows drives, or on Linux and macOS the system root and the mounted volumes. Home is a
 * folder, not a drive. A machine has drive letters or a POSIX root, never both.
 */
export function listDrives(roots: FolderRoot[]): Drive[] {
  const letters: Drive[] = [];
  const posix: Drive[] = [];
  for (const root of roots) {
    if (root.kind === "home") continue;
    const path = normalizeFolderPath(root.path);
    const match = DRIVE_ROOT.exec(path);
    if (match) {
      letters.push({ name: match[1], path, kind: root.kind, label: root.label ?? null });
    } else if (path.startsWith("/")) {
      posix.push({ name: root.name, path, kind: root.kind, label: root.label ?? null });
    }
  }
  return letters.length > 0 ? letters : posix;
}

function isWithin(path: string, root: string): boolean {
  return root === "/" || path === root || path.startsWith(`${root}/`);
}

/**
 * The drive a path is on: `D:\` for a Windows path; on Linux and macOS the innermost of
 * `drives` that holds it. Null for any other path.
 */
export function driveRootOf(path: string, drives: readonly Drive[] = []): string | null {
  const letter = /^([A-Za-z]):(?:[\\/]|$)/.exec(path.trim())?.[1];
  if (letter) return `${letter.toUpperCase()}:\\`;
  const posix = normalizeFolderPath(path);
  if (!posix.startsWith("/")) return null;
  let found: string | null = null;
  for (const drive of drives) {
    if (!drive.path.startsWith("/") || !isWithin(posix, drive.path)) continue;
    if (found === null || drive.path.length > found.length) found = drive.path;
  }
  return found;
}

/** Whether a Linux or macOS path lies where volumes attach, as `/media/me/Card/Photos`. */
export function isUnderVolumeParent(path: string): boolean {
  const posix = normalizeFolderPath(path);
  return POSIX_VOLUME_PARENTS.some((parent) => posix.startsWith(`${parent}/`));
}

/** A path where volumes attach that no mounted volume holds: its volume was unplugged. */
export function isOnMissingVolume(path: string, drives: readonly Drive[]): boolean {
  if (!isUnderVolumeParent(path)) return false;
  const root = driveRootOf(path, drives);
  return root === null || root === "/";
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
