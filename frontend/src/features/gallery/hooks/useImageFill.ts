import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  cancelFillOperation,
  discardFillResult,
  fetchFillOperation,
  fetchFillPresets,
  startImageFill,
} from "@/features/gallery/api/imageFill";
import type { Size } from "@/features/gallery/lib/crop";
import {
  BRUSH_DEFAULT_FRACTION,
  BRUSH_FRACTION_STEP,
  BRUSH_MAX_FRACTION,
  BRUSH_MIN_FRACTION,
  brushRadiusPx,
  hasPaint,
  rasterizeFillMask,
  type BrushMode,
  type FillPoint,
  type FillStroke,
} from "@/features/gallery/lib/fillMask";
import { ApiError, formatApiError } from "@/shared/api/http";
import { MAX_IMAGE_FILLS } from "@/shared/constants";
import { useChanged } from "@/shared/hooks/useChanged";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import type { FillOperationStatus, FillPreset, FillPresetState, ImageFill } from "@/shared/types";

/** Generations take seconds to minutes; a status read a second costs the server nothing. */
export const FILL_POLL_INTERVAL_MS = 1000;

export const FILL_INTERRUPTED_MESSAGE =
  "The generation was interrupted: the server restarted. Generate again.";

/** The blocker before anything is painted: the first step, not a fault. */
export const FILL_NEEDS_PAINT = "Paint over what you want to change.";

const TERMINAL: ReadonlySet<FillOperationStatus> = new Set(["succeeded", "failed", "cancelled"]);

/** `starting` covers drawing the mask and the start request, before the server has an id. */
export type FillProgress = "idle" | "starting" | FillOperationStatus;

interface Operation {
  id: string;
  path: string;
  status: FillOperationStatus;
}

export interface UseImageFillOptions {
  path: string | undefined;
  source: Size;
  /** The draft's kept fills; a new generation goes on top of the last one. */
  fills: readonly ImageFill[];
  /** The Fill tool is showing, so its presets are worth asking about. */
  open: boolean;
  onKeep: (fill: ImageFill) => void;
}

export interface ImageFillControls {
  strokes: readonly FillStroke[];
  brushMode: BrushMode;
  setBrushMode: (mode: BrushMode) => void;
  brushFraction: number;
  setBrushFraction: (fraction: number) => void;
  /** One slider step bigger (+1) or smaller (-1), held inside the slider's range. */
  stepBrush: (direction: 1 | -1) => void;
  /** In original pixels. */
  brushRadius: number;
  beginStroke: (point: FillPoint) => void;
  extendStroke: (point: FillPoint) => void;
  undoStroke: () => void;
  clearStrokes: () => void;
  /** False while a generation runs or a result waits for Keep or Discard. */
  canPaint: boolean;

  /** What goes in the selection; empty removes what was painted over. */
  instruction: string;
  setInstruction: (text: string) => void;

  preset: FillPreset;
  setPreset: (preset: FillPreset) => void;
  presets: readonly FillPresetState[] | null;
  presetsLoading: boolean;
  presetsError: string | null;
  refreshPresets: () => void;

  progress: FillProgress;
  generating: boolean;
  error: string | null;
  canGenerate: boolean;
  /** Why Generate is off, when something other than a run in progress holds it. */
  generateBlocker: string | null;
  generate: () => void;
  cancel: () => void;

  candidate: ImageFill | null;
  /** The kept fills changed under the result, so keeping it would break the chain. */
  candidateStale: boolean;
  showBefore: boolean;
  setShowBefore: (showBefore: boolean) => void;
  keep: () => void;
  discard: () => void;

  /** Unsaved work Apply would not take: a run in flight or a result not yet decided on. */
  pending: boolean;
  /** Fill ids the stage composites, oldest first. */
  previewIds: string[];
  /** Drop the run, the undecided result and the selection; keeps the request settings. */
  reset: () => void;
  /** The composited picture did not load, so the stage still shows the last one that did. */
  reportPreviewError: () => void;
}

export function useImageFill(options: UseImageFillOptions): ImageFillControls {
  const { path, source, fills, open, onKeep } = options;

  const [strokes, setStrokes] = useState<FillStroke[]>([]);
  const [brushMode, setBrushMode] = useState<BrushMode>("paint");
  const [brushFraction, setBrushFraction] = useState(BRUSH_DEFAULT_FRACTION);
  const [instruction, setInstruction] = useState("");
  const [preset, setPreset] = useState<FillPreset>("quality");
  const [starting, setStarting] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<ImageFill | null>(null);
  const [showBefore, setShowBefore] = useState(false);

  const mountedRef = useRef(true);
  const pathRef = useLatestRef(path);
  const operationRef = useLatestRef(operation);
  const candidateRef = useLatestRef(candidate);
  const startingRef = useRef(false);
  // What this editor holds on the server, written where it is learned rather than at render, so
  // leaving a file can still reach the run and result that state has already forgotten.
  const ownedRef = useRef<{ operation: Operation | null; candidate: Operation | null }>({
    operation: null,
    candidate: null,
  });
  // Bumped by every reset, so a start still in flight knows its answer is no longer wanted.
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const generating =
    starting || (operation !== null && !TERMINAL.has(operation.status) && operation.path === path);

  /** Stop the run and drop the unkept result this editor holds, except those for `keepPath`. */
  const release = useCallback((keepPath?: string) => {
    const { operation: running, candidate: unkept } = ownedRef.current;
    if (running && running.path !== keepPath && !TERMINAL.has(running.status)) {
      void cancelFillOperation(running.id).catch(() => undefined);
    }
    if (unkept && unkept.path !== keepPath) {
      void discardFillResult(unkept.path, unkept.id).catch(() => undefined);
    }
    ownedRef.current = {
      operation: running?.path === keepPath ? running : null,
      candidate: unkept?.path === keepPath ? unkept : null,
    };
  }, []);

  const track = useCallback((next: Operation) => {
    ownedRef.current.operation = next;
    setOperation(next);
  }, []);

  const clearLocal = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    setStarting(false);
    setOperation(null);
    setCandidate(null);
    setShowBefore(false);
    setError(null);
    setStrokes([]);
  }, []);

  const reset = useCallback(() => {
    release();
    clearLocal();
  }, [clearLocal, release]);

  // Another file: reset in this render, so its picture never shows the last file's result.
  if (useChanged(path)) {
    setStarting(false);
    setOperation(null);
    setCandidate(null);
    setShowBefore(false);
    setError(null);
    setStrokes([]);
  }
  useEffect(() => {
    generationRef.current += 1;
    startingRef.current = false;
    release(path);
  }, [path, release]);
  useEffect(() => () => release(), [release]);

  // Asked each time the tool opens: installing a node or a model is what fixes a refusal.
  const presetsQuery = useQuery({
    queryKey: ["image-fill-presets"],
    queryFn: fetchFillPresets,
    enabled: open,
    retry: false,
    staleTime: 0,
  });
  const presets = presetsQuery.data?.presets ?? null;
  const { refetch: refetchPresets } = presetsQuery;
  const refreshPresets = useCallback(() => void refetchPresets(), [refetchPresets]);

  useEffect(() => {
    if (!operation || TERMINAL.has(operation.status)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await fetchFillOperation(operation.id);
          if (cancelled || !mountedRef.current) return;
          // A late answer for a run since replaced, or for another file, changes nothing here.
          if (operationRef.current?.id !== next.id || next.path !== pathRef.current) return;
          if (next.status === "succeeded" && next.fill) {
            // The new result replaces the undecided one; a kept fill is in the draft already.
            const previous = ownedRef.current.candidate;
            if (previous) void discardFillResult(previous.path, previous.id).catch(() => undefined);
            ownedRef.current.candidate = { id: next.fill.id, path: next.path, status: next.status };
            setCandidate(next.fill);
            setShowBefore(false);
          }
          if (next.status === "failed") setError(next.error ?? "The generation failed.");
          track({ id: next.id, path: next.path, status: next.status });
        } catch (failure) {
          if (cancelled || !mountedRef.current) return;
          setError(
            failure instanceof ApiError && failure.status === 404
              ? FILL_INTERRUPTED_MESSAGE
              : formatApiError(failure),
          );
          if (operationRef.current?.id === operation.id) track({ ...operation, status: "failed" });
        }
      })();
    }, FILL_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [operation, operationRef, pathRef, track]);

  const canPaint = !generating && candidate === null;

  const beginStroke = useCallback(
    (point: FillPoint) => {
      const radius = brushRadiusPx(brushFraction, source);
      setStrokes((current) => [...current, { mode: brushMode, radius, points: [point] }]);
    },
    [brushFraction, brushMode, source],
  );

  const extendStroke = useCallback((point: FillPoint) => {
    setStrokes((current) => {
      const last = current.at(-1);
      if (!last) return current;
      return [...current.slice(0, -1), { ...last, points: [...last.points, point] }];
    });
  }, []);

  const stepBrush = useCallback((direction: 1 | -1) => {
    setBrushFraction((current) => {
      const steps = Math.round(current / BRUSH_FRACTION_STEP) + direction;
      return Math.min(
        BRUSH_MAX_FRACTION,
        Math.max(BRUSH_MIN_FRACTION, steps * BRUSH_FRACTION_STEP),
      );
    });
  }, []);

  const undoStroke = useCallback(() => setStrokes((current) => current.slice(0, -1)), []);
  const clearStrokes = useCallback(() => setStrokes([]), []);

  const presetState = presets?.find((entry) => entry.preset === preset) ?? null;
  const sized = source.width > 0 && source.height > 0;

  // The preset first: it names what to install, which matters before anything is painted.
  let generateBlocker: string | null = null;
  if (fills.length >= MAX_IMAGE_FILLS) {
    generateBlocker = `An edit holds at most ${MAX_IMAGE_FILLS} fills. Undo one to make another.`;
  } else if (presetState && !presetState.available) {
    generateBlocker = presetState.reason ?? "This preset cannot run.";
  } else if (!hasPaint(strokes)) generateBlocker = FILL_NEEDS_PAINT;
  const canGenerate = Boolean(path) && sized && !generating && generateBlocker === null;

  const stateRef = useLatestRef({
    strokes,
    source,
    fills,
    instruction,
    preset,
    canGenerate,
  });

  const generate = useCallback(() => {
    const state = stateRef.current;
    const mediaPath = pathRef.current;
    if (!state.canGenerate || !mediaPath || startingRef.current) return;

    startingRef.current = true;
    const generation = generationRef.current;
    setStarting(true);
    setError(null);

    void (async () => {
      try {
        const mask = await rasterizeFillMask(state.strokes, state.source);
        const started = await startImageFill(mediaPath, {
          fills: [...state.fills],
          mask_png: mask,
          instruction: state.instruction,
          preset: state.preset,
        });
        if (generation !== generationRef.current || pathRef.current !== mediaPath) {
          void cancelFillOperation(started.id).catch(() => undefined);
          return;
        }
        if (mountedRef.current)
          track({ id: started.id, path: started.path, status: started.status });
      } catch (failure) {
        if (generation === generationRef.current && mountedRef.current) {
          setError(formatApiError(failure));
        }
      } finally {
        if (generation === generationRef.current) {
          startingRef.current = false;
          if (mountedRef.current) setStarting(false);
        }
      }
    })();
  }, [pathRef, stateRef, track]);

  const cancel = useCallback(() => {
    const running = operationRef.current;
    if (!running || TERMINAL.has(running.status)) return;
    void cancelFillOperation(running.id)
      .then((answer) => {
        if (!mountedRef.current || operationRef.current?.id !== answer.id) return;
        track({ id: answer.id, path: answer.path, status: answer.status });
      })
      .catch((failure: unknown) => {
        if (mountedRef.current) setError(formatApiError(failure));
      });
  }, [operationRef, track]);

  const tail = fills.at(-1)?.id ?? null;
  const candidateStale = candidate !== null && (candidate.parent_id ?? null) !== tail;

  const keep = useCallback(() => {
    const result = candidateRef.current;
    const lastKept = stateRef.current.fills.at(-1)?.id ?? null;
    if (!result || (result.parent_id ?? null) !== lastKept) return;
    onKeep(result);
    ownedRef.current.candidate = null;
    setCandidate(null);
    setShowBefore(false);
    setStrokes([]);
  }, [candidateRef, onKeep, stateRef]);

  const discard = useCallback(() => {
    const result = candidateRef.current;
    const mediaPath = pathRef.current;
    if (!result) return;
    if (mediaPath) void discardFillResult(mediaPath, result.id).catch(() => undefined);
    ownedRef.current.candidate = null;
    setCandidate(null);
    setShowBefore(false);
  }, [candidateRef, pathRef]);

  const previewIds = fills.map((fill) => fill.id);
  if (candidate && !candidateStale && !showBefore) previewIds.push(candidate.id);

  const reportPreviewError = useCallback(() => {
    setError(
      "The filled picture could not be loaded. The original may have changed outside " +
        "DataForge; Reset or undo the fills.",
    );
  }, []);

  let progress: FillProgress = "idle";
  if (starting) progress = "starting";
  else if (operation && operation.path === path) progress = operation.status;

  return {
    strokes,
    brushMode,
    setBrushMode,
    brushFraction,
    setBrushFraction,
    stepBrush,
    brushRadius: sized ? brushRadiusPx(brushFraction, source) : 0,
    beginStroke,
    extendStroke,
    undoStroke,
    clearStrokes,
    canPaint,
    instruction,
    setInstruction,
    preset,
    setPreset,
    presets,
    presetsLoading: presetsQuery.isFetching,
    presetsError: presetsQuery.error ? formatApiError(presetsQuery.error) : null,
    refreshPresets,
    progress,
    generating,
    error,
    canGenerate,
    generateBlocker,
    generate,
    cancel,
    candidate,
    candidateStale,
    showBefore,
    setShowBefore,
    keep,
    discard,
    pending: generating || candidate !== null,
    previewIds,
    reset,
    reportPreviewError,
  };
}
