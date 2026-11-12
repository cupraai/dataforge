import { createContext, useContext } from "react";
import type { DesktopNotificationLevel, NotificationVariant } from "@/shared/types";

export type DesktopPermission = NotificationPermission | "unsupported";

export interface DesktopNotifier {
  /** Turned on in Settings and allowed by this browser. */
  enabled: boolean;
  /**
   * The most recently focused DataForge tab. It alone announces pushed job outcomes, so an
   * unfocused notifier means no DataForge tab is focused, and it keeps its stream while hidden.
   */
  notifier: boolean;
  level: DesktopNotificationLevel;
}

export const DESKTOP_OFF: DesktopNotifier = { enabled: false, notifier: false, level: "all" };

export const DesktopNotifierContext = createContext<DesktopNotifier>(DESKTOP_OFF);

export function useDesktopNotifier(): DesktopNotifier {
  return useContext(DesktopNotifierContext);
}

const LEVEL_VARIANTS: Record<DesktopNotificationLevel, readonly NotificationVariant[]> = {
  all: ["success", "warning", "danger"],
  warnings: ["warning", "danger"],
  errors: ["danger"],
};

/** Whether a notification of this variant goes to the desktop at all; focus is the caller's. */
export function desktopWants({ enabled, level }: DesktopNotifier, variant: NotificationVariant) {
  return enabled && LEVEL_VARIANTS[level].includes(variant);
}

const TITLE = "DataForge";
const ICON_SIZE = 192;

export function readDesktopPermission(): DesktopPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Must run inside a click: browsers ignore or penalise permission requests without one. */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// Chrome does not render SVG notification icons, so the favicon is rasterised once.
let iconUrl: string | null = null;
let iconRequested = false;

export function loadDesktopIcon(): void {
  if (iconRequested) return;
  iconRequested = true;
  const image = new Image();
  image.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, ICON_SIZE, ICON_SIZE);
      iconUrl = canvas.toDataURL("image/png");
    } catch {
      // Shown without an icon.
    }
  };
  image.src = "/favicon.svg";
}

/** A `tag` already on screen is replaced silently instead of stacking another. */
export function showDesktopNotification(tag: string, message: string): void {
  if (readDesktopPermission() !== "granted") return;
  try {
    const notification = new Notification(TITLE, {
      body: message,
      tag,
      ...(iconUrl && { icon: iconUrl }),
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some contexts only allow notifications from a service worker; the toast still shows.
  }
}
