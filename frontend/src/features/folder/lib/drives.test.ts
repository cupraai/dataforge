import { describe, expect, it } from "vite-plus/test";
import { iconDisc, iconHardDrive, iconNetwork, iconUsb } from "@/shared/icons";
import { driveIcon, driveRootOf, isOnMissingVolume, listDrives, type Drive } from "./drives";

const POSIX_DRIVES: Drive[] = [
  { name: "/", path: "/", kind: "root", label: null },
  { name: "Camera", path: "/media/me/Camera", kind: "removable", label: null },
  { name: "Camera Backup", path: "/media/me/Camera Backup", kind: "fixed", label: null },
];

describe("listDrives", () => {
  it("keeps only drive roots, named by letter", () => {
    expect(
      listDrives([
        { name: "Home", path: "C:\\Users\\me", kind: "home" },
        { name: "C:\\", path: "c:/", kind: "fixed" },
        { name: "Z:\\", path: "Z:\\", kind: "network", label: "\\\\server\\share" },
        { name: "/", path: "/", kind: "root" },
      ]),
    ).toEqual([
      { name: "C:", path: "C:\\", kind: "fixed", label: null },
      { name: "Z:", path: "Z:\\", kind: "network", label: "\\\\server\\share" },
    ]);
  });

  it("keeps the system root and mounted volumes on Linux and macOS", () => {
    expect(
      listDrives([
        { name: "Home", path: "/home/me", kind: "home" },
        { name: "/", path: "/", kind: "root" },
        { name: "Card", path: "/Volumes/Card/", kind: "removable" },
      ]),
    ).toEqual([
      { name: "/", path: "/", kind: "root", label: null },
      { name: "Card", path: "/Volumes/Card", kind: "removable", label: null },
    ]);
  });
});

describe("driveRootOf", () => {
  it.each([
    ["d:\\Photos\\Album", "D:\\"],
    ["E:/Photos", "E:\\"],
    ["F:", "F:\\"],
    ["/home/photos", null],
    ["\\\\server\\share\\photos", null],
    ["E:Photos", null],
  ])("finds the drive of %s", (path, root) => {
    expect(driveRootOf(path)).toBe(root);
  });

  it.each([
    ["/media/me/Camera/DCIM", "/media/me/Camera"],
    ["/media/me/Camera", "/media/me/Camera"],
    ["/media/me/Camera Backup/2024", "/media/me/Camera Backup"],
    ["/home/me/photos", "/"],
  ])("finds the innermost mounted volume of %s", (path, root) => {
    expect(driveRootOf(path, POSIX_DRIVES)).toBe(root);
  });
});

describe("isOnMissingVolume", () => {
  it.each([
    ["/media/me/Card/DCIM", true],
    ["/Volumes/Card", true],
    ["/media/me/Camera/DCIM", false],
    ["/home/me/photos", false],
    ["D:\\Photos", false],
  ])("judges %s", (path, missing) => {
    expect(isOnMissingVolume(path, POSIX_DRIVES)).toBe(missing);
  });
});

describe("driveIcon", () => {
  it("picks an icon by drive type", () => {
    expect(driveIcon("removable")).toBe(iconUsb);
    expect(driveIcon("network")).toBe(iconNetwork);
    expect(driveIcon("optical")).toBe(iconDisc);
    expect(driveIcon("fixed")).toBe(iconHardDrive);
  });
});
