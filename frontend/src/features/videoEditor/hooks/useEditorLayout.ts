import { useEffect, useState, type CSSProperties } from "react";
import type { MediaView } from "@/features/videoEditor/components/MediaBrowser";
import { readStoredJson, writeStored } from "@/shared/lib/storage";

const LAYOUT_KEY = "video-editor-layout";

interface Layout {
  browser: number;
  inspector: number;
  timeline: number;
  browserOpen: boolean;
  inspectorOpen: boolean;
  mediaView: MediaView;
  guides: boolean;
}

type PaneSize = "browser" | "inspector" | "timeline";
type PaneToggle = "browserOpen" | "inspectorOpen" | "guides";

const DEFAULT_LAYOUT: Layout = {
  browser: 280,
  inspector: 320,
  timeline: 320,
  browserOpen: true,
  inspectorOpen: true,
  mediaView: "grid",
  guides: false,
};

/** Each pane's size range, in pixels. */
const SIZE_LIMITS: Record<PaneSize, [low: number, high: number]> = {
  browser: [200, 560],
  inspector: [240, 560],
  timeline: [180, 680],
};

function parseLayout(value: unknown): Layout | null {
  if (!value || typeof value !== "object") return null;
  const stored = value as Partial<Layout>;
  const number = (key: PaneSize) =>
    typeof stored[key] === "number" ? stored[key] : DEFAULT_LAYOUT[key];
  return {
    browser: number("browser"),
    inspector: number("inspector"),
    timeline: number("timeline"),
    browserOpen: stored.browserOpen !== false,
    inspectorOpen: stored.inspectorOpen !== false,
    mediaView: stored.mediaView === "list" ? "list" : "grid",
    guides: stored.guides === true,
  };
}

/** The editor's pane sizes and toggles, remembered across sessions. */
export function useEditorLayout() {
  const [layout, setLayout] = useState<Layout>(() =>
    readStoredJson(LAYOUT_KEY, parseLayout, DEFAULT_LAYOUT),
  );
  useEffect(() => writeStored(LAYOUT_KEY, JSON.stringify(layout)), [layout]);

  const update = (patch: Partial<Layout>) => setLayout((current) => ({ ...current, ...patch }));

  return {
    layout,
    gridStyle: {
      "--browser-width": layout.browserOpen ? `${layout.browser}px` : "0px",
      "--inspector-width": layout.inspectorOpen ? `${layout.inspector}px` : "0px",
      "--timeline-height": `${layout.timeline}px`,
    } as CSSProperties,
    update,
    toggle: (key: PaneToggle) => setLayout((current) => ({ ...current, [key]: !current[key] })),
    /** Grows the pane by `change` pixels, within its range. */
    resize: (key: PaneSize, change: number) =>
      setLayout((current) => {
        const [low, high] = SIZE_LIMITS[key];
        return { ...current, [key]: Math.min(high, Math.max(low, current[key] + change)) };
      }),
    reset: (key: PaneSize) => update({ [key]: DEFAULT_LAYOUT[key] }),
  };
}
