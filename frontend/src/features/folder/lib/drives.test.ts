import { describe, expect, it } from "vitest";
import { iconDisc, iconHardDrive, iconNetwork, iconUsb } from "@/shared/icons";
import { driveIcon, driveRootOf, listDrives } from "./drives";

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
});

describe("driveIcon", () => {
  it("picks an icon by drive type", () => {
    expect(driveIcon("removable")).toBe(iconUsb);
    expect(driveIcon("network")).toBe(iconNetwork);
    expect(driveIcon("optical")).toBe(iconDisc);
    expect(driveIcon("fixed")).toBe(iconHardDrive);
  });
});
