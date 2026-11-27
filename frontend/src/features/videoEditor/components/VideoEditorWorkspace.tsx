import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  iconArrowLeft,
  iconClapperboard,
  iconLoader2,
  iconTriangleAlert,
  iconX,
} from "@/shared/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { formatApiError } from "@/shared/api/http";
import { isEditableTarget, isTextEntryTarget } from "@/shared/lib/isEditableTarget";
import { matchesShortcut, SHORTCUTS, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import { Icon } from "@/shared/ui/Icon";
import { DialogShell } from "@/shared/ui/DialogShell";
import { DialogNavigationContext } from "@/shared/ui/dialogNavigationContext";
import { DialogSuspendedContext } from "@/shared/ui/dialogSuspendedContext";
import { useDialogNavigationDraft } from "@/shared/hooks/useDialogNavigationDraft";
import type {
  GalleryItem,
  VideoProjectDocument,
  VideoProjectSourceStatus,
  VideoProjectVersionSummary,
} from "@/shared/types";
import {
  deleteVideoProject,
  newVideoProject,
  openVideoProject,
  probeVideoProjectSource,
  readVideoProjectVersion,
  renderVideoProjectFrame,
  saveVideoProject,
  startVideoProject,
  suggestVideoProjectAdjust,
} from "@/features/videoEditor/api/videoProjects";
import { folderPathsEqual } from "@/features/folder/lib/folderPath";
import { withAuto, withoutAuto } from "@/features/gallery/lib/autoAdjust";
import type { VideoEditorRequest } from "@/features/videoEditor/context/VideoEditorContext";
import { EDITOR_ROUTE } from "@/features/videoEditor/lib/editorLocation";
import { useMediaProblems, usePlayheadTime } from "@/features/videoEditor/hooks/usePlayhead";
import { useAudioProxies } from "@/features/videoEditor/hooks/useAudioProxies";
import { useEditorLayout } from "@/features/videoEditor/hooks/useEditorLayout";
import { useProjectSources } from "@/features/videoEditor/hooks/useProjectSources";
import { useProjectExport } from "@/features/videoEditor/hooks/useProjectExport";
import { VIDEO_PROJECTS_QUERY_KEY } from "@/features/videoEditor/hooks/useVideoProjectList";
import {
  useVideoProject,
  type VideoProjectState,
} from "@/features/videoEditor/hooks/useVideoProject";
import {
  nudgeClips,
  setClipLength,
  setClipsLength,
  setClipStart,
  slipClip,
  trimToPlayhead,
  updateClips,
} from "@/features/videoEditor/lib/assembly";
import {
  copyClips,
  pasteAttributes,
  pastableGroups,
  pasteClips,
  type AttributeGroup,
} from "@/features/videoEditor/lib/clipboard";
import { setEditorClipboard, useEditorClipboard } from "@/features/videoEditor/lib/clipboardStore";
import { editorMediaKind } from "@/features/videoEditor/lib/mediaKinds";
import { addMarker, markerBeside } from "@/features/videoEditor/lib/markers";
import { rippleTrimToPlayhead } from "@/features/videoEditor/lib/trimming";
import { transformPatchAt } from "@/features/videoEditor/lib/keyframes";
import { PreviewEngine, type SourceLocation } from "@/features/videoEditor/lib/previewEngine";
import {
  addDissolve,
  addTitle,
  addTrack,
  clipEnd,
  clipLabel,
  clipsFrom,
  deleteClips,
  duplicateClips,
  linkClips,
  newId,
  projectDuration,
  removeDissolve,
  rippleDelete,
  setClipSpeed,
  setDissolveDuration,
  snapToFrame,
  splitClips,
  unlinkClips,
  updateClip,
  updateTrack,
  type Clip,
  type EditResult,
  type Project,
  type TimeRange,
} from "@/features/videoEditor/lib/timeline";
import { ClipInspector } from "./ClipInspector";
import { DeleteVideoProjectDialog } from "./DeleteVideoProjectDialog";
import { EditorTopBar } from "./EditorTopBar";
import { ExportDialog } from "./ExportDialog";
import { LeaveUnsavedProjectDialog } from "./LeaveUnsavedProjectDialog";
import { MediaBrowser } from "./MediaBrowser";
import { MediaProblems } from "./MediaProblems";
import { PasteAttributesDialog } from "./PasteAttributesDialog";
import {
  PreviewPanel,
  type PreviewMode,
  type SourceRange,
  type SourceTransport,
} from "./PreviewPanel";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { SourceIssues } from "./SourceIssues";
import { Splitter } from "./Splitter";
import { Timeline, TIMELINE_ORIGIN_PX, TRACK_HEADER_PX, type TimelineTool } from "./Timeline";
import { VersionsDialog } from "./VersionsDialog";
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND, TimelineToolbar } from "./TimelineToolbar";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import { useChanged } from "@/shared/hooks/useChanged";

interface VideoEditorWorkspaceProps {
  request: VideoEditorRequest;
  /** The current folder's files, which the media browser offers and relinking chooses from. */
  items: GalleryItem[];
  onExit: () => void;
  onOpenInGallery: (path: string) => void;
  /** Told the draft once saving makes or changes one, so the address reopens it. */
  onRelocate?: (request: VideoEditorRequest) => void;
  /** Moves the app to the draft's folder first, as if opened from its gallery. */
  onOpenProject?: (path: string) => Promise<void>;
}

const MESSAGE_MS = 7000;
const ZOOM_STEP = 1.5;
const EMPTY_FIT_SECONDS = 20;

/** Loads the starting project, then hands over to the session that edits it. */
export function VideoEditorWorkspace({
  request,
  items,
  onExit,
  onOpenInGallery,
  onRelocate,
  onOpenProject,
}: VideoEditorWorkspaceProps) {
  const [document, setDocument] = useState<VideoProjectDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kindChanged = useChanged(request.kind);
  const pathChanged = useChanged(request.path);
  if (kindChanged || pathChanged) {
    setDocument(null);
    setError(null);
  }
  useEffect(() => {
    let live = true;
    const load = { video: startVideoProject, project: openVideoProject, new: newVideoProject }[
      request.kind
    ];
    load(request.path)
      .then((loaded) => {
        if (live) setDocument(loaded);
      })
      .catch((caught: unknown) => {
        if (live) setError(formatApiError(caught));
      });
    return () => {
      live = false;
    };
  }, [request.kind, request.path]);

  if (!document) {
    return (
      <DialogShell
        block="video-editor"
        label="Video editor"
        onClose={onExit}
        escape="none"
        scrollLock="video-editor-open"
        enterAnimation="none"
      >
        <div className="video-editor__loading">
          <div className="video-editor__loading-card">
            <span
              className={`video-editor__loading-mark${error ? " video-editor__loading-mark--error" : ""}`}
              aria-hidden="true"
            >
              <Icon icon={error ? iconTriangleAlert : iconClapperboard} />
            </span>
            {error ? (
              <>
                <p role="alert">
                  The editor could not open{" "}
                  {request.kind === "video" ? "this video" : "the project"}: {error}
                </p>
                <Button icon={iconArrowLeft} onClick={onExit} variant="primary" size="sm">
                  Back to gallery
                </Button>
              </>
            ) : (
              <p role="status">
                <Icon icon={iconLoader2} spin /> Opening the editor...
              </p>
            )}
          </div>
        </div>
      </DialogShell>
    );
  }
  return (
    <EditorSession
      document={document}
      items={items}
      onExit={onExit}
      onOpenInGallery={onOpenInGallery}
      onRelocate={onRelocate}
      onOpenProject={onOpenProject}
    />
  );
}

type EditorSessionProps = Omit<VideoEditorWorkspaceProps, "request"> & {
  document: VideoProjectDocument;
};

function sourceLocations(
  statuses: VideoProjectState["sources"],
  sources: Project["sources"],
): Map<string, SourceLocation> {
  const locations = new Map<string, SourceLocation>();
  for (const status of statuses) {
    const source = sources.find((item) => item.id === status.source_id);
    locations.set(status.source_id, {
      path: status.path,
      version: source ? `${source.size}-${source.modified_us}` : "",
      missing: status.state === "missing",
    });
  }
  return locations;
}

/** Every clip edge and the project's start, in order, for jumping from one edit to the next. */
function editPoints(project: Project): number[] {
  const points = new Set<number>([0]);
  for (const clip of project.clips) {
    points.add(clip.start);
    points.add(clipEnd(clip));
  }
  return [...points].sort((a, b) => a - b);
}

function clampZoom(value: number): number {
  return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, value));
}

function EditorSession({
  document,
  items,
  onExit,
  onOpenInGallery,
  onRelocate,
  onOpenProject,
}: EditorSessionProps) {
  const state = useVideoProject(document);
  const { project } = state;
  const [engine] = useState(() => new PreviewEngine());
  const [selection, setSelectionState] = useState<Set<string>>(new Set());
  const [transitionId, setTransitionId] = useState<string | null>(null);
  // Choosing clips always lets go of a chosen dissolve, so the inspector shows the clips.
  const setSelection = useCallback((ids: Set<string>) => {
    setSelectionState(ids);
    if (ids.size > 0) setTransitionId(null);
  }, []);
  const [range, setRange] = useState<TimeRange | null>(null);
  const [tool, setTool] = useState<TimelineTool>("select");
  const [snapping, setSnapping] = useState(true);
  const [pxPerSecond, setPxPerSecond] = useState(40);
  const [message, setMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("timeline");
  const [sourceItem, setSourceItem] = useState<GalleryItem | null>(null);
  const [sourceRange, setSourceRange] = useState<SourceRange>({ start: 0, end: null });
  const [browserTab, setBrowserTab] = useState<"media" | "projects">("media");
  const { layout, gridStyle, ...panes } = useEditorLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [autoPending, setAutoPending] = useState<Set<string>>(new Set());
  const timelineBoxRef = useRef<HTMLDivElement>(null);
  const sourceTransportRef = useRef<SourceTransport | null>(null);
  const projectExport = useProjectExport(state);
  const latestExport = projectExport.latest;
  const queryClient = useQueryClient();
  const mediaProblems = useMediaProblems(engine);

  const clipboard = useEditorClipboard();
  const parentSuspended = useContext(DialogSuspendedContext);
  const navigation = useContext(DialogNavigationContext);
  const dialogOpen =
    projectExport.open || settingsOpen || leaveOpen || deleteOpen || versionsOpen || attributesOpen;
  const locations = useMemo(
    () => sourceLocations(state.sources, project.sources),
    [state.sources, project.sources],
  );
  const folderItems = useMemo(
    () => items.filter((item) => editorMediaKind(item.name) !== null),
    [items],
  );
  const usedPaths = useMemo(() => {
    const used = new Set(project.clips.map((clip) => clip.source_id));
    return new Set(
      state.sources.filter((status) => used.has(status.source_id)).map((status) => status.path),
    );
  }, [project.clips, state.sources]);
  const selectedClips = project.clips.filter((clip) => selection.has(clip.id));
  // Read by edits that wait on the server, so they act on the latest project.
  const projectRef = useLatestRef(project);
  // Undo and redo can take away what is chosen; a choice never names a clip that is gone.
  const clipIds = useMemo(() => new Set(project.clips.map((clip) => clip.id)), [project.clips]);
  if ([...selection].some((id) => !clipIds.has(id))) {
    setSelectionState(new Set([...selection].filter((id) => clipIds.has(id))));
  }
  if (transitionId && !project.transitions.some((item) => item.id === transitionId)) {
    setTransitionId(null);
  }
  const duration = projectDuration(project);

  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => engine.setProject(project, locations), [engine, project, locations]);
  const audioProxies = useAudioProxies(project, locations);
  useEffect(() => engine.setProxies(audioProxies.ready), [engine, audioProxies.ready]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  const zoom = useCallback((value: number) => setPxPerSecond(clampZoom(value)), []);

  const fitTimeline = useCallback(() => {
    const box = timelineBoxRef.current?.clientWidth ?? 900;
    const width = box - TRACK_HEADER_PX - TIMELINE_ORIGIN_PX - 32;
    // An empty project shows a stretch of time to drop into, not one second at full zoom.
    const shown = duration > 0 ? Math.max(duration * 1.05, 1) : EMPTY_FIT_SECONDS;
    zoom(Math.max(width, 200) / shown);
  }, [duration, zoom]);

  // Fit once the first project is laid out; zooming is the user's from then on.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    fitTimeline();
  }, [fitTimeline]);

  const apply = useCallback(
    (result: EditResult): boolean => {
      if (result.project) {
        state.commit(result.project);
        setMessage(null);
        return true;
      }
      setMessage(result.error);
      return false;
    },
    [state],
  );

  /** Previews while a control is held and records one undo step when it is let go. */
  const applyTransient = useCallback(
    (result: EditResult, final: boolean) => {
      if (!result.project) {
        setMessage(result.error);
        return;
      }
      if (final) state.commit(result.project);
      else state.preview(result.project);
    },
    [state],
  );

  const deleteSelection = useCallback(() => {
    if (transitionId) {
      if (apply(removeDissolve(project, transitionId))) setTransitionId(null);
      return;
    }
    if (selection.size === 0) {
      setMessage("Select clips to delete, or mark a range and use Ripple delete.");
      return;
    }
    if (apply(deleteClips(project, selection))) setSelection(new Set());
  }, [apply, project, selection, setSelection, transitionId]);

  const ripple = useCallback(() => {
    if (!range || range.end - range.start <= 0) {
      setMessage("Mark a range first: drag with the Range tool, or press I and O.");
      return;
    }
    if (apply(rippleDelete(project, range))) {
      setRange(null);
      setSelection(new Set());
    }
  }, [apply, project, range, setSelection]);

  const split = useCallback(() => {
    const time = snapToFrame(engine.currentTime, project.frame_rate);
    apply(splitClips(project, time, selection.size ? selection : undefined));
  }, [apply, engine, project, selection]);

  const duplicate = useCallback(() => {
    const result = duplicateClips(project, selection);
    if (apply(result) && result.copies) setSelection(new Set(result.copies));
  }, [apply, project, selection, setSelection]);

  const nudge = useCallback(
    (frames: number) => apply(nudgeClips(project, selection, frames, project.frame_rate)),
    [apply, project, selection],
  );

  const trimEdge = useCallback(
    (edge: "start" | "end", ripple = false) =>
      apply(
        (ripple ? rippleTrimToPlayhead : trimToPlayhead)(
          project,
          selection,
          snapToFrame(engine.currentTime, project.frame_rate),
          edge,
        ),
      ),
    [apply, engine, project, selection],
  );

  /** Every clip from the playhead on; ``ownTracks`` keeps to the selected clips' tracks. */
  const selectForward = useCallback(
    (ownTracks: boolean) => {
      const tracks = ownTracks ? new Set(selectedClips.map((clip) => clip.track_id)) : undefined;
      if (ownTracks && selectedClips.length === 0) {
        setMessage("Select a clip on each track to select forward on.");
        return;
      }
      const ids = clipsFrom(project, engine.currentTime - 1e-6, tracks);
      if (ids.size === 0) setMessage("No clip starts at or after the playhead.");
      setSelection(ids);
    },
    [engine, project, selectedClips, setSelection],
  );

  const markAtPlayhead = useCallback(
    () => apply(addMarker(project, snapToFrame(engine.currentTime, project.frame_rate))),
    [apply, engine, project],
  );

  const copySelection = useCallback(
    (cut: boolean) => {
      const content = copyClips(project, selection, state.folder);
      if (!content) {
        setMessage(`Select clips to ${cut ? "cut" : "copy"}.`);
        return;
      }
      if (cut && !apply(deleteClips(project, selection))) return;
      setEditorClipboard(content);
      if (cut) setSelection(new Set());
    },
    [apply, project, selection, setSelection, state.folder],
  );

  /** Copies land at the playhead; a file new to this project is checked in this folder. */
  const paste = useCallback(async () => {
    if (!clipboard) {
      setMessage("Copy clips first, then paste them at the playhead.");
      return;
    }
    const result = pasteClips(
      project,
      clipboard,
      snapToFrame(engine.currentTime, project.frame_rate),
    );
    if (!apply(result)) return;
    if (result.placed) setSelection(new Set(result.placed));
    const separator = state.folder.includes("\\") ? "\\" : "/";
    const statuses = await Promise.all(
      (result.added ?? []).map(async (source): Promise<VideoProjectSourceStatus> => {
        const path = `${state.folder}${separator}${source.name}`;
        try {
          const found = await probeVideoProjectSource(path);
          const same = found.size === source.size && found.modified_us === source.modified_us;
          return { source_id: source.id, state: same ? "ok" : "changed", path };
        } catch {
          return { source_id: source.id, state: "missing", path };
        }
      }),
    );
    if (statuses.length) state.setSources([...state.sources, ...statuses]);
  }, [apply, clipboard, engine, project, setSelection, state]);

  const attributeDonor = clipboard?.clips.find((clip) => clip.id === clipboard.donorId) ?? null;
  const attributeGroups =
    attributeDonor && selectedClips.length > 0 ? pastableGroups(attributeDonor, selectedClips) : [];
  const openPasteAttributes = useCallback(() => {
    if (!attributeDonor || selection.size === 0) {
      setMessage("Copy a clip, select the clips to change, then paste its attributes.");
      return;
    }
    if (attributeGroups.length === 0) {
      setMessage("The selected clips cannot take any of the copied clip's settings.");
      return;
    }
    setAttributesOpen(true);
  }, [attributeDonor, attributeGroups.length, selection.size]);

  const insertTitle = useCallback(() => {
    const result = addTitle(project, snapToFrame(engine.currentTime, project.frame_rate));
    if (apply(result) && result.placed) setSelection(new Set(result.placed));
  }, [apply, engine, project, setSelection]);

  const seekTimeline = useCallback(
    (time: number) => {
      setPreviewMode("timeline");
      engine.seek(time);
    },
    [engine],
  );
  const scrubTimeline = useCallback(
    (time: number) => {
      setPreviewMode("timeline");
      engine.scrub(time);
    },
    [engine],
  );

  const sources = useProjectSources({
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
  });
  const { addSource, resolveSource } = sources;

  /** Reads the clip's take of its source as it is now and composes the suggestion onto it. */
  const autoAdjustClip = useCallback(
    async (clip: Clip) => {
      const location = clip.source_id ? locations.get(clip.source_id) : undefined;
      if (!location || location.missing) {
        setMessage("Relink this clip's source before using Auto.");
        return;
      }
      setAutoPending((current) => new Set(current).add(clip.id));
      try {
        const { suggestion } = await suggestVideoProjectAdjust({
          path: location.path,
          start: clip.source_in,
          end: clip.kind === "video" ? clip.source_in + clip.duration * clip.speed : null,
          crop: clip.crop ?? null,
        });
        const latest = projectRef.current;
        const current = latest.clips.find((item) => item.id === clip.id);
        if (!current) return;
        const base = current.auto_adjust
          ? withoutAuto(current.adjust, current.auto_adjust)
          : current.adjust;
        const { adjust, autoAdjust } = withAuto(base, suggestion);
        apply(updateClip(latest, clip.id, { adjust, auto_adjust: autoAdjust }));
      } catch (caught) {
        setMessage(`Auto could not read ${clipLabel(project, clip)}: ${formatApiError(caught)}`);
      } finally {
        setAutoPending((current) => {
          const next = new Set(current);
          next.delete(clip.id);
          return next;
        });
      }
    },
    [apply, locations, project, projectRef],
  );

  /** Saves what is owed; when that fails, asks the user and resolves false. */
  const confirmLeave = useCallback(async () => {
    engine.pause();
    if (await state.flush()) return true;
    setLeaveOpen(true);
    return false;
  }, [engine, state]);
  const requestExit = useCallback(async () => {
    if (await confirmLeave()) onExit();
  }, [confirmLeave, onExit]);
  // Every way out saves first; a reload or closed tab gets the browser's prompt instead.
  const owesSaveRef = useLatestRef(state.saveState !== "new" && state.saveState !== "saved");
  useDialogNavigationDraft({
    unsavedChanges: false,
    blocked: leaveOpen,
    beforeLeave: confirmLeave,
  });
  useBlocker({
    shouldBlockFn: ({ next, action }) => {
      if (
        next.routeId === EDITOR_ROUTE ||
        (navigation && action !== "PUSH" && action !== "REPLACE")
      )
        return false;
      return confirmLeave().then((saved) => !saved);
    },
    enableBeforeUnload: () => owesSaveRef.current,
  });

  const draftPath = state.path;
  useEffect(() => {
    if (draftPath && !parentSuspended) onRelocate?.({ kind: "project", path: draftPath });
  }, [draftPath, parentSuspended, onRelocate]);

  const openDraft = useCallback(
    async (path: string) => {
      if (!(await state.flush())) {
        setMessage("Save this project before opening another; it has unsaved changes.");
        return;
      }
      try {
        const opened = await openVideoProject(path);
        if (onOpenProject && !folderPathsEqual(opened.folder, state.folder)) {
          await onOpenProject(path);
        }
        engine.pause();
        state.load(opened);
        setSelection(new Set());
        setTransitionId(null);
        setRange(null);
        engine.seek(0);
        fittedRef.current = false;
      } catch (caught) {
        setMessage(formatApiError(caught));
      }
    },
    [engine, onOpenProject, setSelection, state],
  );

  /** Saves a copy under a new id and name, then carries on editing the copy. */
  const duplicateProject = useCallback(async () => {
    if (!(await state.flush())) {
      setMessage("Save this project before duplicating it; it has unsaved changes.");
      return;
    }
    try {
      const copy: Project = {
        ...state.project,
        id: newId(),
        name: `${state.project.name} copy`.slice(0, 120),
        revision: 0,
      };
      const saved = await saveVideoProject(state.folder, null, null, copy);
      void queryClient.invalidateQueries({ queryKey: VIDEO_PROJECTS_QUERY_KEY });
      await openDraft(saved.path);
    } catch (caught) {
      setMessage(formatApiError(caught));
    }
  }, [openDraft, queryClient, state]);

  /** A stored version replaces the timeline as one undoable edit of this same draft. */
  const restoreVersion = useCallback(
    async (version: VideoProjectVersionSummary) => {
      const stored = await readVideoProjectVersion(version.id, state.folder);
      const current = state.project;
      engine.pause();
      state.commit({
        ...stored.project,
        id: current.id,
        revision: current.revision,
        created_at: current.created_at,
        updated_at: current.updated_at,
      });
      const restored = new Set(stored.sources.map((status) => status.source_id));
      state.setSources([
        ...state.sources.filter((status) => !restored.has(status.source_id)),
        ...stored.sources,
      ]);
      setSelection(new Set());
      setTransitionId(null);
      setRange(null);
    },
    [engine, setSelection, state],
  );

  const usedIssues = state.sources.filter(
    (status) =>
      status.state !== "ok" && project.clips.some((clip) => clip.source_id === status.source_id),
  );
  const exportBlocked = usedIssues.length
    ? "Relink or accept the sources listed above the timeline before exporting."
    : duration <= 0
      ? "The timeline is empty."
      : null;

  /** I and O on the timeline mark the range a ripple delete removes, like a source's in and out. */
  const markTimeline = useCallback(
    (edge: "in" | "out") => {
      const time = snapToFrame(engine.currentTime, project.frame_rate);
      setRange((current) =>
        edge === "in"
          ? { start: time, end: current && current.end > time ? current.end : time }
          : { start: current && current.start < time ? current.start : 0, end: time },
      );
    },
    [engine, project.frame_rate],
  );

  // Keys only outside form controls and dialogs; undo and redo also from sliders.
  const keysRef = useLatestRef((event: KeyboardEvent) => {
    if (dialogOpen || menuOpen || event.defaultPrevented) return;
    const run = (action: () => void) => {
      event.preventDefault();
      action();
    };
    if (!isTextEntryTarget(event.target)) {
      if (matchesShortcut(event, SHORTCUTS.editorRedo)) return run(state.redo);
      if (matchesShortcut(event, SHORTCUTS.editorUndo)) return run(state.undo);
    }
    if (isEditableTarget(event)) return;
    const frame = 1 / project.frame_rate;
    const source = previewMode === "source" ? sourceTransportRef.current : null;
    const jump = (direction: -1 | 1) => {
      const now = engine.currentTime;
      const points = editPoints(project);
      const target =
        direction > 0
          ? points.find((point) => point > now + 1e-4)
          : [...points].reverse().find((point) => point < now - 1e-4);
      if (target !== undefined) seekTimeline(target);
    };
    const jumpMarker = (direction: -1 | 1) => {
      const marker = markerBeside(project, engine.currentTime, direction);
      if (marker) seekTimeline(marker.time);
    };
    const step = (frames: -1 | 1) =>
      source
        ? source.step(frames)
        : engine.seek(snapToFrame(engine.currentTime + frames * frame, project.frame_rate));
    const clearMarks = () => {
      if (source) {
        setSourceRange({ start: 0, end: null });
        return;
      }
      setRange(null);
      setSelectionState(new Set());
      setTransitionId(null);
    };
    // In priority order; a binding whose condition is false lets the key go on down the list.
    const bindings: [ShortcutDefinition, () => void, boolean?][] = [
      [SHORTCUTS.editorPlayPause, () => (source ? source.toggle() : engine.toggle())],
      [SHORTCUTS.editorStepBack, () => step(-1)],
      [SHORTCUTS.editorStepForward, () => step(1)],
      [SHORTCUTS.editorGoToStart, () => (source ? source.seekToEdge("start") : engine.seek(0))],
      [SHORTCUTS.editorGoToEnd, () => (source ? source.seekToEdge("end") : engine.seek(duration))],
      [SHORTCUTS.editorPreviousEdit, () => jump(-1)],
      [SHORTCUTS.editorNextEdit, () => jump(1)],
      [SHORTCUTS.editorPreviousMarker, () => jumpMarker(-1)],
      [SHORTCUTS.editorNextMarker, () => jumpMarker(1)],
      [SHORTCUTS.editorAddMarker, markAtPlayhead, !source],
      [SHORTCUTS.editorMarkIn, () => (source ? source.markIn() : markTimeline("in"))],
      [SHORTCUTS.editorMarkOut, () => (source ? source.markOut() : markTimeline("out"))],
      [
        SHORTCUTS.editorClearMarks,
        clearMarks,
        Boolean(source || range || selection.size > 0 || transitionId),
      ],
      [SHORTCUTS.editorSelectTool, () => setTool("select")],
      [SHORTCUTS.editorBladeTool, () => setTool("blade")],
      [SHORTCUTS.editorRangeTool, () => setTool("range")],
      [SHORTCUTS.editorRippleTool, () => setTool("ripple")],
      [SHORTCUTS.editorRollTool, () => setTool("roll")],
      [
        SHORTCUTS.editorSelectAll,
        () => setSelection(new Set(project.clips.map((clip) => clip.id))),
      ],
      [SHORTCUTS.editorSelectForward, () => selectForward(false)],
      [SHORTCUTS.editorSelectForwardOnTracks, () => selectForward(true)],
      [SHORTCUTS.editorSnapping, () => setSnapping((on) => !on)],
      [SHORTCUTS.editorZoomIn, () => zoom(pxPerSecond * ZOOM_STEP)],
      [SHORTCUTS.editorZoomOut, () => zoom(pxPerSecond / ZOOM_STEP)],
      [SHORTCUTS.editorZoomFit, fitTimeline],
      [SHORTCUTS.editorSplit, split],
      [SHORTCUTS.editorRippleDelete, ripple],
      [SHORTCUTS.editorDelete, deleteSelection],
      [SHORTCUTS.editorDuplicate, duplicate],
      [SHORTCUTS.editorNudgeBack, () => nudge(-1)],
      [SHORTCUTS.editorNudgeForward, () => nudge(1)],
      [SHORTCUTS.editorTrimStart, () => trimEdge("start")],
      [SHORTCUTS.editorTrimEnd, () => trimEdge("end")],
      [SHORTCUTS.editorRippleTrimStart, () => trimEdge("start", true)],
      [SHORTCUTS.editorRippleTrimEnd, () => trimEdge("end", true)],
      // Copy and cut leave the browser's own text copy alone while no clip is chosen.
      [SHORTCUTS.editorCopy, () => copySelection(false), selection.size > 0],
      [SHORTCUTS.editorCut, () => copySelection(true), selection.size > 0],
      [SHORTCUTS.editorPasteAttributes, openPasteAttributes],
      [SHORTCUTS.editorPaste, () => void paste()],
    ];
    const binding = bindings.find(
      ([shortcut, , enabled = true]) => enabled && matchesShortcut(event, shortcut),
    );
    if (binding) run(binding[1]);
  });
  // A layout effect, so a key pressed as the editor first shows is never dropped.
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => keysRef.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysRef]);

  return (
    <DialogShell
      block="video-editor"
      label={`Video editor: ${project.name}`}
      onClose={() => void requestExit()}
      escape="none"
      scrollLock="video-editor-open"
      enterAnimation="none"
      suspended={dialogOpen}
    >
      <div className="video-editor__frame" style={gridStyle}>
        <EditorTopBar
          state={state}
          latestExport={latestExport}
          onCancelExport={projectExport.cancelLatest}
          onDismissExport={projectExport.dismissLatest}
          onOpenExport={() => {
            if (!latestExport) return;
            void state.flush().then((saved) => {
              if (saved) onOpenInGallery(latestExport.output_path);
              else setLeaveOpen(true);
            });
          }}
          browserOpen={layout.browserOpen}
          inspectorOpen={layout.inspectorOpen}
          onToggleBrowser={() => panes.toggle("browserOpen")}
          onToggleInspector={() => panes.toggle("inspectorOpen")}
          menuOpen={menuOpen}
          onMenuOpenChange={setMenuOpen}
          onOpenProject={() => {
            panes.update({ browserOpen: true });
            setBrowserTab("projects");
          }}
          onSettings={() => setSettingsOpen(true)}
          onDuplicate={() => void duplicateProject()}
          onVersions={() => setVersionsOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          onExport={projectExport.show}
          canExport={duration > 0}
          onBack={() => void requestExit()}
        />

        <div className="video-editor__workarea">
          {layout.browserOpen && (
            <>
              <MediaBrowser
                tab={browserTab}
                onTab={setBrowserTab}
                items={folderItems}
                usedPaths={usedPaths}
                view={layout.mediaView}
                onView={(mediaView) => panes.update({ mediaView })}
                previewing={previewMode === "source" ? (sourceItem?.path ?? null) : null}
                currentProjectPath={state.path}
                onPreview={(item) => {
                  setSourceItem(item);
                  setSourceRange({ start: 0, end: null });
                  setPreviewMode("source");
                  engine.pause();
                }}
                onAdd={(item) => void addSource(item.path, engine.currentTime)}
                onOpenProject={(path) => void openDraft(path)}
              />
              <Splitter
                label="Media browser width"
                orientation="vertical"
                onResize={(delta) => panes.resize("browser", delta)}
                onReset={() => panes.reset("browser")}
              />
            </>
          )}

          <PreviewPanel
            mode={previewMode}
            onModeChange={(mode) => {
              setPreviewMode(mode);
              if (mode === "source") engine.pause();
            }}
            engine={engine}
            project={project}
            selectedClip={selectedClips.length === 1 ? selectedClips[0] : null}
            onTransform={(clip, transform, final) =>
              applyTransient(
                updateClip(project, clip.id, transformPatchAt(clip, engine.currentTime, transform)),
                final,
              )
            }
            sourceItem={sourceItem}
            sourceRange={sourceRange}
            onSourceRange={setSourceRange}
            onAddSource={() =>
              sourceItem &&
              void addSource(sourceItem.path, engine.currentTime, undefined, sourceRange)
            }
            onInsertSource={() => void sources.placeFromSource("insert")}
            onReplaceSource={(policy) => void sources.placeFromSource(policy)}
            replaceLabel={
              selectedClips.length === 1 && selectedClips[0].kind !== "title"
                ? clipLabel(project, selectedClips[0])
                : null
            }
            sourceTransportRef={sourceTransportRef}
            hasMissing={usedIssues.some((status) => status.state === "missing")}
            guides={layout.guides}
            onGuides={() => panes.toggle("guides")}
            renderFrame={(time) => renderVideoProjectFrame(state.folder, project, time)}
            notice={
              <MediaProblems
                project={project}
                problems={mediaProblems}
                converting={sources.converting}
                onRetry={(sourceId) => engine.retry(sourceId)}
                onConvert={(sourceId) => void sources.convertSource(sourceId)}
              />
            }
          />

          {layout.inspectorOpen && (
            <>
              <Splitter
                label="Inspector width"
                orientation="vertical"
                onResize={(delta) => panes.resize("inspector", -delta)}
                onReset={() => panes.reset("inspector")}
              />
              <aside
                className="video-editor__inspector video-editor__pane"
                aria-label="Clip inspector"
              >
                <div className="video-editor__pane-header">
                  <span className="video-editor__pane-title">Inspector</span>
                </div>
                <div className="video-editor__inspector-scroll" data-scroll-lock-allow>
                  <InspectorAtPlayhead
                    engine={engine}
                    project={project}
                    selection={selectedClips}
                    transitionId={transitionId}
                    onSeek={seekTimeline}
                    onTrackEdit={(trackId, patch, final) =>
                      applyTransient(updateTrack(project, trackId, patch), final)
                    }
                    onMarkersEdit={apply}
                    onMixEdit={(patch, final) =>
                      applyTransient(
                        { project: { ...project, mix: { ...project.mix, ...patch } } },
                        final,
                      )
                    }
                    onEdit={(patch, final) => {
                      if (selectedClips.length === 1) {
                        applyTransient(updateClip(project, selectedClips[0].id, patch), final);
                      }
                    }}
                    onSpeed={(speed) =>
                      selectedClips[0] && apply(setClipSpeed(project, selectedClips[0].id, speed))
                    }
                    onStart={(seconds) =>
                      selectedClips[0] && apply(setClipStart(project, selectedClips[0].id, seconds))
                    }
                    onSourceIn={(seconds) =>
                      selectedClips[0] && apply(slipClip(project, selectedClips[0].id, seconds))
                    }
                    onDuration={(seconds) =>
                      selectedClips[0] &&
                      apply(setClipLength(project, selectedClips[0].id, seconds))
                    }
                    onBatchEdit={(patch, final) =>
                      applyTransient(updateClips(project, selection, patch), final)
                    }
                    onBatchLength={(seconds) => apply(setClipsLength(project, selection, seconds))}
                    onPasteAttributes={attributeGroups.length > 0 ? openPasteAttributes : undefined}
                    onUnlink={() => apply(unlinkClips(project, selection))}
                    onLink={() => apply(linkClips(project, selection))}
                    onAddDissolve={() => {
                      const result = addDissolve(project, selectedClips[0]?.id ?? "");
                      if (apply(result) && result.project) {
                        setTransitionId(result.project.transitions.at(-1)?.id ?? null);
                        setSelection(new Set());
                      }
                    }}
                    onDissolveDuration={(seconds, final) =>
                      transitionId &&
                      applyTransient(setDissolveDuration(project, transitionId, seconds), final)
                    }
                    onRemoveDissolve={() => {
                      if (transitionId && apply(removeDissolve(project, transitionId)))
                        setTransitionId(null);
                    }}
                    onDelete={deleteSelection}
                    autoPending={selectedClips.length === 1 && autoPending.has(selectedClips[0].id)}
                    onAuto={() => selectedClips[0] && void autoAdjustClip(selectedClips[0])}
                    preparingSound={audioProxies.preparing}
                  />
                </div>
              </aside>
            </>
          )}
        </div>

        <Splitter
          label="Timeline height"
          orientation="horizontal"
          onResize={(delta) => panes.resize("timeline", -delta)}
          onReset={() => panes.reset("timeline")}
        />

        <section
          className="video-editor__timeline video-editor__pane"
          ref={timelineBoxRef}
          aria-label="Timeline"
        >
          <TimelineToolbar
            project={project}
            tool={tool}
            onTool={setTool}
            canUndo={state.canUndo}
            canRedo={state.canRedo}
            onUndo={state.undo}
            onRedo={state.redo}
            onSplit={split}
            canDuplicate={selection.size > 0}
            onDuplicate={duplicate}
            canDelete={selection.size > 0 || transitionId !== null}
            onDelete={deleteSelection}
            range={range}
            onRipple={ripple}
            onClearRange={() => setRange(null)}
            onAddTitle={insertTitle}
            onAddVideoTrack={() => apply(addTrack(project, "video"))}
            onAddAudioTrack={() => apply(addTrack(project, "audio"))}
            snapping={snapping}
            onSnapping={() => setSnapping((on) => !on)}
            pxPerSecond={pxPerSecond}
            onZoom={zoom}
            onFit={fitTimeline}
          />
          <SourceIssues
            project={project}
            statuses={state.sources}
            items={folderItems}
            busy={sources.busy}
            onRelink={(sourceId, item) => void resolveSource(sourceId, item.path)}
            onAccept={(sourceId) => {
              const status = state.sources.find((item) => item.source_id === sourceId);
              if (status) void resolveSource(sourceId, status.path);
            }}
          />
          <div className="video-editor__timeline-body">
            {message && (
              <p className="video-editor__toast" role="alert">
                <Icon icon={iconTriangleAlert} />
                <span>{message}</span>
                <IconButton
                  icon={iconX}
                  label="Dismiss"
                  tooltip={false}
                  onClick={() => setMessage(null)}
                  size="xs"
                  variant="ghost"
                />
              </p>
            )}
            <Timeline
              project={project}
              engine={engine}
              sources={locations}
              selection={selection}
              selectedTransition={transitionId}
              range={range}
              tool={tool}
              snapping={snapping}
              pxPerSecond={pxPerSecond}
              onSelect={(ids, transition) => {
                setSelectionState(ids);
                setTransitionId(transition ?? null);
              }}
              onRange={setRange}
              onPreview={state.preview}
              onCommit={state.commit}
              onError={setMessage}
              onSeek={seekTimeline}
              onScrub={scrubTimeline}
              onDropSource={(path, time, trackId) => void addSource(path, time, trackId)}
              onTracks={(next) => state.commit(next)}
              onZoom={zoom}
            />
          </div>
        </section>
      </div>

      <DialogSuspendedContext.Provider value={parentSuspended || leaveOpen}>
        {projectExport.open && (
          <ExportDialog
            project={project}
            range={range}
            selectionSpan={
              selectedClips.length > 0
                ? {
                    start: Math.min(...selectedClips.map((clip) => clip.start)),
                    end: Math.max(...selectedClips.map(clipEnd)),
                  }
                : null
            }
            busy={projectExport.busy}
            error={projectExport.error}
            blocked={exportBlocked}
            onExport={(settings, span) => void projectExport.start(settings, span)}
            onCancel={projectExport.close}
          />
        )}
        {deleteOpen && state.path && (
          <DeleteVideoProjectDialog
            name={project.name}
            onClose={() => setDeleteOpen(false)}
            onDelete={async () => {
              const path = state.path;
              if (!path) return;
              engine.pause();
              // Pending edits land first, so no save can write the file back after it is gone.
              await state.flush();
              await deleteVideoProject(path);
              onExit();
            }}
          />
        )}
        {attributesOpen && attributeDonor && (
          <PasteAttributesDialog
            donorLabel={clipLabel(project, attributeDonor)}
            targetCount={selectedClips.length}
            groups={attributeGroups}
            onCancel={() => setAttributesOpen(false)}
            onPaste={(groups: AttributeGroup[]) => {
              if (apply(pasteAttributes(project, selection, attributeDonor, groups))) {
                setAttributesOpen(false);
              }
            }}
          />
        )}
        {versionsOpen && (
          <VersionsDialog
            project={project}
            onRestore={restoreVersion}
            onClose={() => setVersionsOpen(false)}
          />
        )}
        {settingsOpen && (
          <ProjectSettingsDialog
            project={project}
            onCancel={() => setSettingsOpen(false)}
            onSave={(patch) => {
              state.commit({ ...project, ...patch });
              setSettingsOpen(false);
            }}
          />
        )}
      </DialogSuspendedContext.Provider>
      {leaveOpen && (
        <LeaveUnsavedProjectDialog
          saveError={state.saveError}
          conflict={state.saveState === "conflict"}
          onSave={() => (state.saveState === "conflict" ? state.saveAsCopy() : state.flush())}
          onExit={onExit}
          onClose={() => setLeaveOpen(false)}
        />
      )}
    </DialogShell>
  );
}

/** The inspector reads animated values at the playhead, so it redraws with the readouts. */
function InspectorAtPlayhead({
  engine,
  ...props
}: Omit<ComponentProps<typeof ClipInspector>, "time"> & { engine: PreviewEngine }) {
  const time = usePlayheadTime(engine);
  return <ClipInspector {...props} time={time} />;
}
