import { describe, expect, it } from "vite-plus/test";
import { fileManagerName, trashName } from "./platform";

describe("platform names", () => {
  it("names the trash as each system does", () => {
    expect(trashName("Win32")).toBe("Recycle Bin");
    expect(trashName("Windows")).toBe("Recycle Bin");
    expect(trashName("MacIntel")).toBe("Trash");
    expect(trashName("Linux x86_64")).toBe("Trash");
  });

  it("names the file manager as each system does", () => {
    expect(fileManagerName("Windows")).toBe("File Explorer");
    expect(fileManagerName("macOS")).toBe("Finder");
    expect(fileManagerName("Linux")).toBe("file manager");
  });
});
