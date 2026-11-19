import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createStoredStore, useStoredStore } from "@/shared/lib/storedStore";
import {
  parseThemePreference,
  THEME_CACHE_KEY,
  uiSettingsQueryOptions,
  updateUiSettings,
} from "@/shared/preferences/uiPreferences";
import { prefersReducedMotion } from "@/shared/lib/motion";
import type { ThemePreference } from "@/shared/types";

export type ResolvedTheme = "light" | "dark";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

const saved = createStoredStore(THEME_CACHE_KEY, parseThemePreference);
let preview: ThemePreference | null = null;

export function resolveTheme(value: ThemePreference): ResolvedTheme {
  if (value !== "system") return value;
  return window.matchMedia?.(LIGHT_QUERY).matches ? "light" : "dark";
}

function applyTheme(): void {
  const root = document.documentElement;
  const next = resolveTheme(preview ?? saved.get());
  if (root.dataset.theme === next) return;
  const swap = () => {
    root.dataset.theme = next;
  };
  // The first paint, a hidden tab and reduced motion take the new colours at once.
  if (
    !root.dataset.theme ||
    typeof document.startViewTransition !== "function" ||
    document.visibilityState === "hidden" ||
    prefersReducedMotion()
  ) {
    swap();
    return;
  }
  // One crossfade of the whole window; per-element colour fades would run out of step under it.
  root.classList.add("theme-switching");
  document
    .startViewTransition(swap)
    .finished.catch(() => {
      // A transition skipped by another one still ran the swap.
    })
    .finally(() => root.classList.remove("theme-switching"));
}

saved.subscribe(applyTheme);

export function useThemePreference(): ThemePreference {
  return useStoredStore(saved);
}

export function setThemePreference(next: ThemePreference): void {
  saved.set(next);
  updateUiSettings({ theme: next }).catch(() => {
    // The choice is already applied and cached locally.
  });
}

/** Shows a theme without saving it; `null` returns to the saved one. */
export function previewThemePreference(next: ThemePreference | null): void {
  preview = next;
  applyTheme();
}

/** Follows the OS scheme and the server's copy. Mount once, under the query client. */
export function useThemeSync(): void {
  const supersededRef = useRef(false);
  const { data, isFetched, isError } = useQuery(uiSettingsQueryOptions());
  // The seed is this tab's own cache; only an answer from the server can bring news.
  const serverTheme = isFetched && !isError ? data.theme : null;

  useEffect(() => {
    applyTheme();

    // A choice made here before the server answers wins over the server's older copy.
    const unsubscribe = saved.subscribe(() => {
      supersededRef.current = true;
    });

    const media = window.matchMedia?.(LIGHT_QUERY);
    media?.addEventListener("change", applyTheme);

    return () => {
      unsubscribe();
      media?.removeEventListener("change", applyTheme);
    };
  }, []);

  useEffect(() => {
    if (serverTheme === null || supersededRef.current) return;
    supersededRef.current = true;
    saved.set(serverTheme);
  }, [serverTheme]);
}
