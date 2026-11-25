import { focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createTestQueryClient, queryWrapper } from "@/test/queryClient";
import {
  THEME_CACHE_KEY,
  updateUiSettings,
  useUiSettings,
  useUpdateUiSettings,
} from "./uiPreferences";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const serverCopy = {
  show_automation_specs: true,
  theme: "dark",
  keep_candidate_metadata: false,
  jobs_drawer_filters: { job_types: ["watermark"], status: "failed", folder: "all" },
  gallery_cards: {
    small_caption_lines: 0,
    large_caption_lines: 6,
    megapixels: false,
    large_aspect_ratio: false,
    large_tags: false,
    list_caption_preview: false,
    badges: "compact",
    card_actions: ["open", "rename_file"],
  },
  editor: {
    line_wrap: false,
    line_numbers: false,
    caption_spellcheck: false,
    caption_spellcheck_language: "de",
    caption_suggestions: false,
  },
  tagging_enabled: true,
  desktop_notifications: true,
  desktop_notification_level: "errors",
};

function respond(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useUiSettings", () => {
  it("paints the local copy first, then takes the server's and mirrors it", async () => {
    localStorage.setItem(THEME_CACHE_KEY, "light");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(serverCopy)));

    const { result } = renderHook(() => useUiSettings(), { wrapper: queryWrapper().wrapper });

    expect(result.current.theme).toBe("light");
    await waitFor(() =>
      expect(result.current).toEqual({
        showAutomationSpecs: true,
        theme: "dark",
        keepCandidateMetadata: false,
        jobsDrawerFilters: { jobTypes: ["watermark"], status: "failed", folder: "all" },
        galleryCards: {
          smallCaptionLines: 0,
          largeCaptionLines: 6,
          megapixels: false,
          largeAspectRatio: false,
          largeTags: false,
          listCaptionPreview: false,
          badges: "compact",
          cardActions: ["open", "rename_file"],
        },
        editor: {
          lineWrap: false,
          lineNumbers: false,
          captionSpellcheck: false,
          captionSpellcheckLanguage: "de",
          captionSuggestions: false,
        },
        taggingEnabled: true,
        desktopNotifications: true,
        desktopNotificationLevel: "errors",
      }),
    );
    expect(JSON.parse(localStorage.getItem("editor-options") ?? "null")).toEqual(
      result.current.editor,
    );
    expect(JSON.parse(localStorage.getItem("gallery-card-options") ?? "null")).toEqual(
      result.current.galleryCards,
    );
    expect(localStorage.getItem("automation-specs-visible")).toBe("true");
    expect(localStorage.getItem("keep-candidate-metadata")).toBe("false");
    expect(localStorage.getItem("tagging-enabled")).toBe("true");
    expect(localStorage.getItem("desktop-notifications")).toBe("true");
    expect(localStorage.getItem("desktop-notification-level")).toBe("errors");
  });

  it("keeps candidate metadata until it is turned off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { wrapper } = queryWrapper(createTestQueryClient({ retry: false }));

    const { result } = renderHook(() => useUiSettings(), { wrapper });

    expect(result.current.keepCandidateMetadata).toBe(true);
  });

  it("paints the mirrored card options before the server answers", async () => {
    const cards = {
      smallCaptionLines: 4,
      largeCaptionLines: 2,
      megapixels: false,
      largeAspectRatio: false,
      largeTags: false,
      listCaptionPreview: true,
      badges: "hidden",
      cardActions: ["delete"],
    };
    localStorage.setItem("gallery-card-options", JSON.stringify(cards));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { wrapper } = queryWrapper(createTestQueryClient({ retry: false }));

    const { result } = renderHook(() => useUiSettings(), { wrapper });

    expect(result.current.galleryCards).toEqual(cards);
  });

  it("drops a mirrored spelling language the build does not offer", async () => {
    localStorage.setItem(
      "editor-options",
      JSON.stringify({ lineWrap: false, captionSpellcheckLanguage: "xx" }),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { wrapper } = queryWrapper(createTestQueryClient({ retry: false }));

    const { result } = renderHook(() => useUiSettings(), { wrapper });

    expect(result.current.editor.lineWrap).toBe(false);
    expect(result.current.editor.captionSpellcheckLanguage).toBe("en-US");
  });

  it("drops a mirrored caption line count the build does not offer", async () => {
    localStorage.setItem("gallery-card-options", JSON.stringify({ largeCaptionLines: 3 }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { wrapper } = queryWrapper(createTestQueryClient({ retry: false }));

    const { result } = renderHook(() => useUiSettings(), { wrapper });

    expect(result.current.galleryCards.largeCaptionLines).toBe(4);
  });

  it("keeps the local copy when the backend cannot be reached", async () => {
    localStorage.setItem(THEME_CACHE_KEY, "light");
    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = queryWrapper(createTestQueryClient({ retry: false }));

    const { result } = renderHook(() => useUiSettings(), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.theme).toBe("light");
  });

  it("shares one request between readers that start together", async () => {
    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(respond(serverCopy));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = queryWrapper();

    const first = renderHook(() => useUiSettings(), { wrapper });
    const second = renderHook(() => useUiSettings(), { wrapper });

    await waitFor(() => expect(second.result.current.desktopNotificationLevel).toBe("errors"));
    expect(first.result.current).toBe(second.result.current);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useUpdateUiSettings", () => {
  it("applies a change at once and saves it", async () => {
    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockImplementation(async (_url: string, init?: RequestInit) =>
        respond(
          init?.method === "PUT"
            ? { ...serverCopy, desktop_notification_level: "warnings" }
            : serverCopy,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () => ({ settings: useUiSettings(), update: useUpdateUiSettings() }),
      { wrapper: queryWrapper().wrapper },
    );
    await waitFor(() => expect(result.current.settings.desktopNotificationLevel).toBe("errors"));

    act(() => result.current.update({ desktopNotificationLevel: "warnings" }));

    await waitFor(() => expect(result.current.settings.desktopNotificationLevel).toBe("warnings"));
    expect(localStorage.getItem("desktop-notification-level")).toBe("warnings");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/preferences/ui",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ desktop_notification_level: "warnings" }),
      }),
    );
  });
});

it("keeps later choices visible while preference writes finish in order", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const writes = vi
    .fn<(init: RequestInit) => Promise<Response>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? writes(init) : Promise.resolve(respond(serverCopy)),
    ),
  );
  const { wrapper } = queryWrapper();
  const reader = renderHook(() => useUiSettings(), { wrapper });
  const one = renderHook(() => useUpdateUiSettings(), { wrapper });
  const two = renderHook(() => useUpdateUiSettings(), { wrapper });
  await waitFor(() => expect(reader.result.current.desktopNotificationLevel).toBe("errors"));
  act(() => one.result.current({ desktopNotificationLevel: "warnings" }));
  await waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
  act(() => two.result.current({ desktopNotificationLevel: "all", showAutomationSpecs: false }));
  await waitFor(() => expect(reader.result.current.desktopNotificationLevel).toBe("all"));
  const writesBeforeFirstReply = writes.mock.calls.length;
  await act(async () =>
    first.resolve(respond({ ...serverCopy, desktop_notification_level: "warnings" })),
  );
  await waitFor(() => expect(writes).toHaveBeenCalledTimes(2));
  const stateAfterFirstReply = reader.result.current;
  const mirroredAfterFirstReply = localStorage.getItem("desktop-notification-level");
  await act(async () =>
    second.resolve(
      respond({
        ...serverCopy,
        desktop_notification_level: "all",
        show_automation_specs: false,
      }),
    ),
  );
  expect(writesBeforeFirstReply).toBe(1);
  expect(stateAfterFirstReply.desktopNotificationLevel).toBe("all");
  expect(stateAfterFirstReply.showAutomationSpecs).toBe(false);
  expect(mirroredAfterFirstReply).toBe("all");
  expect(reader.result.current.desktopNotificationLevel).toBe("all");
});

it("shares fresh preferences across remounts and refreshes an expired copy", async () => {
  const fetchMock = vi
    .fn<(url: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(respond(serverCopy));
  vi.stubGlobal("fetch", fetchMock);
  const { wrapper } = queryWrapper();
  const first = renderHook(() => useUiSettings(), { wrapper });
  await waitFor(() => expect(first.result.current.desktopNotificationLevel).toBe("errors"));
  first.unmount();
  const second = renderHook(() => useUiSettings(), { wrapper });
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  second.unmount();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
  fetchMock.mockImplementation(() =>
    Promise.resolve(respond({ ...serverCopy, desktop_notification_level: "warnings" })),
  );
  const third = renderHook(() => useUiSettings(), { wrapper });
  await waitFor(() => expect(third.result.current.desktopNotificationLevel).toBe("warnings"));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("continues queued writes after a failure, including theme saves outside React", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const fetchMock = vi
    .fn<(url: string, init?: RequestInit) => Promise<Response>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal("fetch", fetchMock);
  const failed = updateUiSettings({ desktopNotificationLevel: "warnings" }).catch(
    (error: unknown) => error,
  );
  const later = updateUiSettings({ theme: "light", desktopNotificationLevel: "all" });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(localStorage.getItem("desktop-notification-level")).toBe("all");
  first.reject(new TypeError("Failed to fetch"));
  await failed;
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  second.resolve(respond({ ...serverCopy, desktop_notification_level: "all", theme: "light" }));
  await expect(later).resolves.toMatchObject({ theme: "light", desktopNotificationLevel: "all" });
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/preferences/ui",
    expect.objectContaining({
      body: JSON.stringify({ theme: "light", desktop_notification_level: "all" }),
    }),
  );
});
