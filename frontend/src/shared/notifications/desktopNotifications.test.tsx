import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiSettings } from "@/shared/preferences/uiPreferences";
import { useDesktopNotifier } from "./desktopNotifications";
import { DesktopNotificationsProvider } from "./DesktopNotificationsProvider";

const settings = { desktopNotifications: true };

vi.mock("@/shared/preferences/uiPreferences", () => ({
  useUiSettings: () => settings as UiSettings,
}));

class FakeNotification {
  static permission: NotificationPermission = "granted";
}

interface LockEntry {
  callback: LockGrantedCallback<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** One lock, with the queueing, `signal` and `steal` behaviour the notifier relies on. */
class FakeLocks {
  holder: LockEntry | null = null;
  queue: LockEntry[] = [];

  request(_name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) {
    return new Promise((resolve, reject) => {
      const entry = { callback, resolve, reject };
      if (options.steal) {
        const stolen = this.holder;
        this.holder = null;
        stolen?.reject(new DOMException("Stolen", "AbortError"));
        this.grant(entry);
        return;
      }
      options.signal?.addEventListener("abort", () => {
        const index = this.queue.indexOf(entry);
        if (index < 0) return;
        this.queue.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      });
      if (this.holder) this.queue.push(entry);
      else this.grant(entry);
    });
  }

  private grant(entry: LockEntry) {
    this.holder = entry;
    void Promise.resolve(entry.callback({ name: "lock", mode: "exclusive" })).then((value) => {
      if (this.holder === entry) {
        this.holder = null;
        const next = this.queue.shift();
        if (next) this.grant(next);
      }
      entry.resolve(value);
    });
  }
}

function Probe({ label }: { label: string }) {
  const { enabled, notifier } = useDesktopNotifier();
  return <p data-testid={label}>{`${String(enabled)} ${String(notifier)}`}</p>;
}

function renderTab(label: string) {
  return render(
    <DesktopNotificationsProvider>
      <Probe label={label} />
    </DesktopNotificationsProvider>,
  );
}

const roleOf = (label: string) => document.querySelector(`[data-testid="${label}"]`)?.textContent;

const settle = () => act(async () => {});

let locks: FakeLocks;
let focused: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  settings.desktopNotifications = true;
  FakeNotification.permission = "granted";
  vi.stubGlobal("Notification", FakeNotification);
  locks = new FakeLocks();
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
  focused = vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  focused.mockRestore();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "locks");
});

describe("DesktopNotificationsProvider", () => {
  it("makes the focused tab the notifier and hands the role to the next focused one", async () => {
    renderTab("first");
    await settle();
    expect(roleOf("first")).toBe("true true");

    focused.mockReturnValue(false);
    const second = renderTab("second");
    await settle();
    expect(roleOf("second")).toBe("true false");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await settle();
    expect(roleOf("first")).toBe("true false");
    expect(roleOf("second")).toBe("true true");

    // Closing the notifier passes the role to the tab waiting in line.
    second.unmount();
    await settle();
    expect(roleOf("first")).toBe("true true");
  });

  it("holds no lock while the browser has not allowed notifications", async () => {
    FakeNotification.permission = "default";
    renderTab("only");
    await settle();

    expect(roleOf("only")).toBe("false false");
    expect(locks.holder).toBeNull();
  });

  it("holds no lock while turned off", async () => {
    settings.desktopNotifications = false;
    renderTab("only");
    await settle();

    expect(roleOf("only")).toBe("false false");
    expect(locks.holder).toBeNull();
  });

  it("makes every tab a notifier without the Web Locks API", async () => {
    Reflect.deleteProperty(navigator, "locks");
    focused.mockReturnValue(false);
    renderTab("only");
    await settle();

    expect(roleOf("only")).toBe("true true");
  });
});
