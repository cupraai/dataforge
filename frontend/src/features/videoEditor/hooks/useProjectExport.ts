import { useCallback, useState } from "react";
import { startVideoProjectExport } from "@/features/videoEditor/api/videoProjects";
import type { VideoProjectState } from "@/features/videoEditor/hooks/useVideoProject";
import { useVideoExports } from "@/features/videoEditor/hooks/useVideoExports";
import { formatApiError } from "@/shared/api/http";
import type { VideoProjectExportSettings, VideoProjectExportSpan } from "@/shared/types";

/** The export dialog's state, and this project's latest export with what can be done to it. */
export function useProjectExport(state: VideoProjectState) {
  const { exports, track, cancel, dismiss } = useVideoExports();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Started here, so they show before the draft has a path to match them by.
  const [startedIds, setStartedIds] = useState<string[]>([]);

  const start = useCallback(
    async (settings: VideoProjectExportSettings, span: VideoProjectExportSpan | null) => {
      // A part's own name is not kept as the project's export name.
      const kept = span ? { ...settings, filename: state.project.export.filename } : settings;
      const next = state.amend((current) => ({ ...current, export: kept }));
      setBusy(true);
      setError(null);
      try {
        const started = await startVideoProjectExport(
          state.folder,
          state.path,
          { ...next, export: settings },
          span,
        );
        track(started);
        setStartedIds((current) => [started.id, ...current]);
        setOpen(false);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setBusy(false);
      }
    },
    [state, track],
  );

  const latest = exports.find(
    (item) =>
      startedIds.includes(item.id) || (state.path !== null && item.project_path === state.path),
  );

  return {
    open,
    show: () => {
      setError(null);
      setOpen(true);
    },
    close: () => setOpen(false),
    busy,
    error,
    start,
    latest,
    cancelLatest: () => latest && void cancel(latest.id),
    dismissLatest: () => {
      if (!latest) return;
      setStartedIds((current) => current.filter((id) => id !== latest.id));
      void dismiss(latest.id);
    },
  };
}
