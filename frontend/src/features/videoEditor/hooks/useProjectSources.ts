import { useCallback, useState, type RefObject } from "react";
import {
  makeCompatibleCopy,
  probeVideoProjectSource,
} from "@/features/videoEditor/api/videoProjects";
import type { PreviewMode, SourceRange } from "@/features/videoEditor/components/PreviewPanel";
import type { VideoProjectState } from "@/features/videoEditor/hooks/useVideoProject";
import { insertSource, replaceClip, type ReplacePolicy } from "@/features/videoEditor/lib/assembly";
import type { PreviewEngine } from "@/features/videoEditor/lib/previewEngine";
import {
  placeSource,
  snapToFrame,
  type Clip,
  type EditResult,
  type Project,
} from "@/features/videoEditor/lib/timeline";
import { formatApiError } from "@/shared/api/http";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import type { GalleryItem, VideoProjectSource, VideoProjectSourceInfo } from "@/shared/types";

interface ProjectSourcesOptions {
  state: VideoProjectState;
  /** Read by edits that wait on the server, so they act on the latest project. */
  projectRef: RefObject<Project>;
  selectedClips: Clip[];
  engine: PreviewEngine;
  apply: (result: EditResult) => boolean;
  setSelection: (ids: Set<string>) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setMessage: (message: string | null) => void;
  /** The file in the source monitor, and its marks. */
  sourceItem: GalleryItem | null;
  sourceRange: SourceRange;
}

/** Bringing files into the project, and relinking or converting the ones it has. */
export function useProjectSources({
  state,
  projectRef,
  selectedClips,
  engine,
  apply,
  setSelection,
  setPreviewMode,
  setMessage,
  sourceItem,
  sourceRange,
}: ProjectSourcesOptions) {
  const { project } = state;
  const selectedClipsRef = useLatestRef(selectedClips);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState<ReadonlySet<string>>(new Set());

  /** A source new to the project is recorded as found where it was just read. */
  const noteSource = useCallback(
    (next: Project | undefined, path: string, name: string) => {
      const source = next?.sources.find((item) => item.name === name);
      if (source && !state.sources.some((status) => status.source_id === source.id)) {
        state.setSources([...state.sources, { source_id: source.id, state: "ok", path }]);
      }
    },
    [state],
  );

  /** Insert, or a replacement of the one selected clip, from the source monitor's marks. */
  const placeFromSource = useCallback(
    async (mode: "insert" | ReplacePolicy) => {
      if (!sourceItem) return;
      const target = selectedClipsRef.current;
      if (mode !== "insert" && target.length !== 1) {
        setMessage("Select the one clip on the timeline to replace.");
        return;
      }
      setBusy(true);
      try {
        const info = await probeVideoProjectSource(sourceItem.path);
        const marks = { rangeIn: sourceRange.start, rangeOut: sourceRange.end ?? undefined };
        const latest = projectRef.current;
        if (mode === "insert") {
          const time = snapToFrame(engine.currentTime, latest.frame_rate);
          const result = insertSource(latest, { info, start: time, ...marks });
          if (apply(result)) {
            noteSource(result.project, info.path, info.name);
            if (result.placed) setSelection(new Set(result.placed));
            setPreviewMode("timeline");
          }
        } else {
          const result = replaceClip(latest, target[0].id, { info, policy: mode, ...marks });
          if (apply(result)) {
            noteSource(result.project, info.path, info.name);
            setPreviewMode("timeline");
            if (result.note) setMessage(result.note);
          }
        }
      } catch (caught) {
        setMessage(formatApiError(caught));
      } finally {
        setBusy(false);
      }
    },
    [
      apply,
      engine,
      noteSource,
      projectRef,
      selectedClipsRef,
      setMessage,
      setPreviewMode,
      setSelection,
      sourceItem,
      sourceRange,
    ],
  );

  const addSource = useCallback(
    async (path: string, start: number, trackId?: string, range?: SourceRange) => {
      setBusy(true);
      try {
        const info: VideoProjectSourceInfo = await probeVideoProjectSource(path);
        const result = placeSource(project, {
          info,
          start,
          trackId,
          rangeIn: range?.start,
          rangeOut: range?.end ?? undefined,
        });
        if (apply(result) && result.placed) {
          const placedSource = result.project?.clips.find((clip) => clip.id === result.placed?.[0]);
          const sourceId = placedSource?.source_id;
          if (sourceId && !state.sources.some((status) => status.source_id === sourceId)) {
            state.setSources([
              ...state.sources,
              { source_id: sourceId, state: "ok", path: info.path },
            ]);
          }
          setSelection(new Set(result.placed));
          setPreviewMode("timeline");
        }
      } catch (caught) {
        setMessage(formatApiError(caught));
      } finally {
        setBusy(false);
      }
    },
    [apply, project, setMessage, setPreviewMode, setSelection, state],
  );

  const resolveSource = useCallback(
    async (sourceId: string, path: string) => {
      setBusy(true);
      try {
        const info = await probeVideoProjectSource(path);
        if (project.sources.some((item) => item.id !== sourceId && item.name === info.name)) {
          setMessage(`${info.name} is already a source of this project; relink to another file.`);
          return;
        }
        const relink = (source: VideoProjectSource): VideoProjectSource =>
          source.id === sourceId
            ? {
                ...source,
                name: info.name,
                size: info.size,
                modified_us: info.modified_us,
                duration: info.duration ?? null,
                width: info.width ?? null,
                height: info.height ?? null,
                frame_rate: info.frame_rate ?? null,
                has_audio: info.has_audio,
              }
            : source;
        state.amend((current) => ({ ...current, sources: current.sources.map(relink) }));
        state.setSources(
          state.sources.map((status) =>
            status.source_id === sourceId ? { ...status, state: "ok", path: info.path } : status,
          ),
        );
      } catch (caught) {
        setMessage(formatApiError(caught));
      } finally {
        setBusy(false);
      }
    },
    [project, setMessage, state],
  );

  /** Writes an H.264 copy of a source the browser cannot play, and relinks the project to it. */
  const convertSource = useCallback(
    async (sourceId: string) => {
      const status = state.sources.find((item) => item.source_id === sourceId);
      if (!status) return;
      setConverting((current) => new Set([...current, sourceId]));
      try {
        const copy = await makeCompatibleCopy(status.path);
        await resolveSource(sourceId, copy.path);
      } catch (caught) {
        setMessage(formatApiError(caught));
      } finally {
        setConverting((current) => new Set([...current].filter((id) => id !== sourceId)));
      }
    },
    [resolveSource, setMessage, state.sources],
  );

  return { busy, converting, placeFromSource, addSource, resolveSource, convertSource };
}
