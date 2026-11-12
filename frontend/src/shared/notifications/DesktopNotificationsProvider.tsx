import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUiSettings } from "@/shared/preferences/uiPreferences";
import {
  DesktopNotifierContext,
  loadDesktopIcon,
  readDesktopPermission,
  type DesktopPermission,
} from "./desktopNotifications";

const NOTIFIER_LOCK = "dataforge-desktop-notifier";

function useDesktopPermission(setting: boolean): DesktopPermission {
  const [permission, setPermission] = useState(readDesktopPermission);

  // Settings asks before saving, and the user can change it in the browser at any time.
  useEffect(() => {
    let disposed = false;
    let status: PermissionStatus | null = null;
    const sync = () => setPermission(readDesktopPermission());
    sync();
    window.addEventListener("focus", sync);
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "notifications" })
        .then((result) => {
          if (disposed) return;
          status = result;
          status.addEventListener("change", sync);
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      window.removeEventListener("focus", sync);
      status?.removeEventListener("change", sync);
    };
  }, [setting]);

  return permission;
}

/**
 * Holds the notifier lock in the most recently focused tab: focus steals it, and a tab that lost
 * it waits in line, so closing the notifier hands the role to a remaining tab. Without the Web
 * Locks API every tab is a notifier.
 */
function useNotifierRole(enabled: boolean): boolean {
  const [holding, setHolding] = useState(false);
  const hasLocks = "locks" in navigator;

  useEffect(() => {
    if (!enabled || !hasLocks) return;
    const locks = navigator.locks;

    let disposed = false;
    let held = false;
    let stealing = false;
    let release: (() => void) | null = null;
    let waiter: AbortController | null = null;

    const request = (steal: boolean) => {
      const controller = steal ? null : new AbortController();
      waiter = controller;
      stealing = steal;
      const options: LockOptions = controller ? { signal: controller.signal } : { steal: true };
      locks
        .request(NOTIFIER_LOCK, options, () => {
          if (disposed) return undefined;
          waiter = null;
          stealing = false;
          held = true;
          setHolding(true);
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        })
        .catch(() => {
          // A waiter this tab withdrew, or a teardown: nothing to take over.
          if (disposed || controller?.signal.aborted) return;
          // Another tab gained focus and stole the lock.
          held = false;
          stealing = false;
          release = null;
          setHolding(false);
          request(false);
        });
    };

    const claim = () => {
      if (held || stealing) return;
      waiter?.abort();
      request(true);
    };

    if (document.hasFocus()) claim();
    else request(false);
    window.addEventListener("focus", claim);

    return () => {
      disposed = true;
      window.removeEventListener("focus", claim);
      waiter?.abort();
      release?.();
      setHolding(false);
    };
  }, [enabled, hasLocks]);

  return enabled && (!hasLocks || holding);
}

export function DesktopNotificationsProvider({ children }: { children: ReactNode }) {
  const { desktopNotifications, desktopNotificationLevel: level } = useUiSettings();
  const permission = useDesktopPermission(desktopNotifications);
  const enabled = desktopNotifications && permission === "granted";
  const notifier = useNotifierRole(enabled);

  useEffect(() => {
    if (enabled) loadDesktopIcon();
  }, [enabled]);

  const value = useMemo(() => ({ enabled, notifier, level }), [enabled, notifier, level]);

  return <DesktopNotifierContext value={value}>{children}</DesktopNotifierContext>;
}
