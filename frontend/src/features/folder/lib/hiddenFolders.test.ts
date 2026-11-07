import { describe, expect, it } from "vitest";
import { visibleFolders } from "./hiddenFolders";

const album = { name: "Album", path: "C:\\Photos\\Album", hidden: false };
const cache = { name: ".cache", path: "C:\\Photos\\.cache", hidden: true };

describe("visibleFolders", () => {
  it("lists every folder while the setting is off", () => {
    const folders = [cache, album];

    expect(visibleFolders(folders, false)).toBe(folders);
  });

  it("leaves hidden folders out while the setting is on", () => {
    expect(visibleFolders([cache, album], true)).toEqual([album]);
  });

  it("keeps a hidden folder that holds the open folder", () => {
    expect(visibleFolders([cache, album], true, "C:\\Photos\\.cache\\thumbs")).toEqual([
      cache,
      album,
    ]);
    expect(visibleFolders([cache, album], true, "c:/photos/.cache")).toEqual([cache, album]);
    expect(visibleFolders([cache, album], true, "C:\\Photos\\.cache2")).toEqual([album]);
  });
});
