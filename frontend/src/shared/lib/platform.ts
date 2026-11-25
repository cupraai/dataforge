/** The browser runs on the machine that serves the app, so its platform is the backend's. */
export function browserPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const hints = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return hints?.platform || navigator.platform;
}

type OsFamily = "windows" | "mac" | "other";

function osFamily(platform: string): OsFamily {
  if (/^win/i.test(platform)) return "windows";
  if (/^mac/i.test(platform)) return "mac";
  return "other";
}

/** Where deletes go, as the system names it. */
export function trashName(platform: string = browserPlatform()): string {
  return osFamily(platform) === "windows" ? "Recycle Bin" : "Trash";
}

/** The system file manager, for "Open in ..." labels. */
export function fileManagerName(platform: string = browserPlatform()): string {
  switch (osFamily(platform)) {
    case "windows":
      return "File Explorer";
    case "mac":
      return "Finder";
    default:
      return "file manager";
  }
}
