import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cacheCardOptions,
  cardOptionsFromWire,
  cardOptionsToWire,
  readCardOptions,
  type GalleryCardOptions,
} from "@/features/gallery/lib/cardOptions";
import type { JobFilters } from "@/features/jobs/lib/jobFilters";
import {
  cacheJobFilters,
  jobFiltersFromWire,
  jobFiltersToWire,
  readJobFilters,
} from "@/features/jobs/lib/jobFilterPreferences";
import { putJson, requestJson } from "@/shared/api/http";
import {
  cacheEditorOptions,
  editorOptionsFromWire,
  editorOptionsToWire,
  readEditorOptions,
  type EditorOptions,
} from "@/shared/preferences/editorPreferences";
import { readStored, writeStored } from "@/shared/lib/storage";
import { mirroredPreference } from "@/shared/query/refreshPolicies";
import type {
  DesktopNotificationLevel,
  ThemePreference,
  UiSettingsResponse,
  UiSettingsUpdate,
} from "@/shared/types";

export interface UiSettings {
  sort: string;
  showAutomationSpecs: boolean;
  theme: ThemePreference;
  keepCandidateMetadata: boolean;
  jobsDrawerFilters: JobFilters;
  galleryCards: GalleryCardOptions;
  editor: EditorOptions;
  /** Leaves dot folders and folders Windows marks hidden out of folder lists. */
  hideHiddenFolders: boolean;
  /** Background tagging; while off, nothing about tags is shown. */
  taggingEnabled: boolean;
  /** Mirrors notifications to the desktop while DataForge is in the background. */
  desktopNotifications: boolean;
  /** Which variants reach the desktop. */
  desktopNotificationLevel: DesktopNotificationLevel;
}

const SORT_CACHE_KEY = "gallery-sort";
const AUTOMATION_SPECS_CACHE_KEY = "automation-specs-visible";
const KEEP_CANDIDATE_METADATA_CACHE_KEY = "keep-candidate-metadata";
const HIDE_HIDDEN_FOLDERS_CACHE_KEY = "hide-hidden-folders";
const TAGGING_ENABLED_CACHE_KEY = "tagging-enabled";
const DESKTOP_NOTIFICATIONS_CACHE_KEY = "desktop-notifications";
const DESKTOP_NOTIFICATION_LEVEL_CACHE_KEY = "desktop-notification-level";
/** `index.html` reads this key before first paint; rename both together. */
export const THEME_CACHE_KEY = "ui-theme";

const UI_SETTINGS_QUERY_KEY = ["ui-settings"] as const;

const THEME_PREFERENCES: readonly string[] = [
  "system",
  "light",
  "dark",
] satisfies ThemePreference[];

const DESKTOP_NOTIFICATION_LEVELS: readonly string[] = [
  "all",
  "warnings",
  "errors",
] satisfies DesktopNotificationLevel[];

function parseDesktopNotificationLevel(raw: string | null | undefined): DesktopNotificationLevel {
  return raw != null && DESKTOP_NOTIFICATION_LEVELS.includes(raw)
    ? (raw as DesktopNotificationLevel)
    : "all";
}

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw !== null && THEME_PREFERENCES.includes(raw) ? (raw as ThemePreference) : "system";
}

function readCachedUiSettings(): UiSettings {
  return {
    sort: readStored(SORT_CACHE_KEY) ?? "",
    showAutomationSpecs: readStored(AUTOMATION_SPECS_CACHE_KEY) === "true",
    theme: parseThemePreference(readStored(THEME_CACHE_KEY)),
    // On unless turned off: accepting without it loses the original's metadata.
    keepCandidateMetadata: readStored(KEEP_CANDIDATE_METADATA_CACHE_KEY) !== "false",
    jobsDrawerFilters: readJobFilters(),
    galleryCards: readCardOptions(),
    editor: readEditorOptions(),
    hideHiddenFolders: readStored(HIDE_HIDDEN_FOLDERS_CACHE_KEY) === "true",
    taggingEnabled: readStored(TAGGING_ENABLED_CACHE_KEY) === "true",
    desktopNotifications: readStored(DESKTOP_NOTIFICATIONS_CACHE_KEY) === "true",
    desktopNotificationLevel: parseDesktopNotificationLevel(
      readStored(DESKTOP_NOTIFICATION_LEVEL_CACHE_KEY),
    ),
  };
}

function cacheUiSettings({
  sort,
  showAutomationSpecs,
  keepCandidateMetadata,
  jobsDrawerFilters,
  galleryCards,
  editor,
  hideHiddenFolders,
  taggingEnabled,
  desktopNotifications,
  desktopNotificationLevel,
}: Partial<UiSettings>): void {
  if (sort !== undefined) writeStored(SORT_CACHE_KEY, sort);
  if (showAutomationSpecs !== undefined) {
    writeStored(AUTOMATION_SPECS_CACHE_KEY, String(showAutomationSpecs));
  }
  if (keepCandidateMetadata !== undefined) {
    writeStored(KEEP_CANDIDATE_METADATA_CACHE_KEY, String(keepCandidateMetadata));
  }
  if (jobsDrawerFilters !== undefined) cacheJobFilters(jobsDrawerFilters);
  if (galleryCards !== undefined) cacheCardOptions(galleryCards);
  if (editor !== undefined) cacheEditorOptions(editor);
  if (hideHiddenFolders !== undefined) {
    writeStored(HIDE_HIDDEN_FOLDERS_CACHE_KEY, String(hideHiddenFolders));
  }
  if (taggingEnabled !== undefined) {
    writeStored(TAGGING_ENABLED_CACHE_KEY, String(taggingEnabled));
  }
  if (desktopNotifications !== undefined) {
    writeStored(DESKTOP_NOTIFICATIONS_CACHE_KEY, String(desktopNotifications));
  }
  if (desktopNotificationLevel !== undefined) {
    writeStored(DESKTOP_NOTIFICATION_LEVEL_CACHE_KEY, desktopNotificationLevel);
  }
}

function parseUiSettingsResponse(data: UiSettingsResponse): UiSettings {
  return {
    sort: data.sort,
    showAutomationSpecs: Boolean(data.show_automation_specs),
    theme: data.theme,
    keepCandidateMetadata: data.keep_candidate_metadata,
    jobsDrawerFilters: jobFiltersFromWire(data.jobs_drawer_filters),
    galleryCards: cardOptionsFromWire(data.gallery_cards),
    editor: editorOptionsFromWire(data.editor),
    hideHiddenFolders: data.hide_hidden_folders,
    taggingEnabled: Boolean(data.tagging_enabled),
    desktopNotifications: Boolean(data.desktop_notifications),
    desktopNotificationLevel: parseDesktopNotificationLevel(data.desktop_notification_level),
  };
}

// Theme saves also call updateUiSettings outside React, so they share the same queue.
let pendingUiSave: Promise<unknown> = Promise.resolve();

async function fetchUiSettings(signal: AbortSignal): Promise<UiSettings> {
  await pendingUiSave;
  signal.throwIfAborted();
  const settings = parseUiSettingsResponse(
    await requestJson<UiSettingsResponse>("/api/preferences/ui", { signal }),
  );
  signal.throwIfAborted();
  cacheUiSettings(settings);
  return settings;
}

export function updateUiSettings(partial: Partial<UiSettings>): Promise<UiSettings> {
  cacheUiSettings(partial);

  const body: UiSettingsUpdate = {};
  if (partial.sort !== undefined) body.sort = partial.sort;
  if (partial.showAutomationSpecs !== undefined) {
    body.show_automation_specs = partial.showAutomationSpecs;
  }
  if (partial.theme !== undefined) body.theme = partial.theme;
  if (partial.keepCandidateMetadata !== undefined) {
    body.keep_candidate_metadata = partial.keepCandidateMetadata;
  }
  if (partial.jobsDrawerFilters !== undefined) {
    body.jobs_drawer_filters = jobFiltersToWire(partial.jobsDrawerFilters);
  }
  if (partial.galleryCards !== undefined) {
    body.gallery_cards = cardOptionsToWire(partial.galleryCards);
  }
  if (partial.editor !== undefined) body.editor = editorOptionsToWire(partial.editor);
  if (partial.hideHiddenFolders !== undefined) {
    body.hide_hidden_folders = partial.hideHiddenFolders;
  }
  if (partial.taggingEnabled !== undefined) body.tagging_enabled = partial.taggingEnabled;
  if (partial.desktopNotifications !== undefined) {
    body.desktop_notifications = partial.desktopNotifications;
  }
  if (partial.desktopNotificationLevel !== undefined) {
    body.desktop_notification_level = partial.desktopNotificationLevel;
  }

  const save = pendingUiSave.then(async () =>
    parseUiSettingsResponse(await putJson<UiSettingsResponse>("/api/preferences/ui", body)),
  );
  // A failed write must not prevent later choices from reaching the server.
  pendingUiSave = save.catch(() => {});
  return save;
}

export function uiSettingsQueryOptions() {
  return queryOptions({
    queryKey: UI_SETTINGS_QUERY_KEY,
    queryFn: ({ signal }) => fetchUiSettings(signal),
    ...mirroredPreference(readCachedUiSettings),
  });
}

export function useUiSettings(): UiSettings {
  return useQuery(uiSettingsQueryOptions()).data;
}

/** Applies a change at once and persists it in the background; a failed save is ignored. */
export function useUpdateUiSettings() {
  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    // Save replies are whole snapshots; the local partial already holds the latest intent.
    mutationFn: updateUiSettings,
    onMutate: async (partial: Partial<UiSettings>) => {
      await queryClient.cancelQueries({ queryKey: UI_SETTINGS_QUERY_KEY });
      queryClient.setQueryData<UiSettings>(
        UI_SETTINGS_QUERY_KEY,
        (current) => current && { ...current, ...partial },
      );
    },
  });

  return mutate;
}
