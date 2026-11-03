import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import {
  UNZOOMED,
  panBy,
  wheelPixels,
  wheelZoomFactor,
  zoomAt,
  type FrameSize,
  type StageView,
} from "@/features/gallery/lib/stageZoom";
import { useChanged } from "@/shared/hooks/useChanged";
import { useLatestRef } from "@/shared/hooks/useLatestRef";

/** The middle button, as `PointerEvent.button` numbers it. */
const MIDDLE_BUTTON = 1;

interface UseStageZoomOptions {
  stageRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLElement | null>;
  /** Off returns to the whole picture; the gestures only belong to the tool that uses them. */
  active: boolean;
  /** A quarter turn lays the canvas on its side, so its screen size swaps. */
  turned: boolean;
  /** Changing file starts unzoomed. */
  resetKey: string;
  /** Alt+wheel: +1 for up (bigger), -1 for down. */
  onAltWheel?: (direction: 1 | -1) => void;
}

export interface StageZoom {
  view: StageView;
  panning: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  /** Back to the whole picture. */
  reset: () => void;
}

/** Wheel zooms around the pointer, a middle-button drag pans, and Alt+wheel is handed back. */
export function useStageZoom({
  stageRef,
  canvasRef,
  active,
  turned,
  resetKey,
  onAltWheel,
}: UseStageZoomOptions): StageZoom {
  const [view, setView] = useState<StageView>(UNZOOMED);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const onAltWheelRef = useLatestRef(onAltWheel);

  const activeChanged = useChanged(active);
  const fileChanged = useChanged(resetKey);
  if (activeChanged || fileChanged) {
    setView(UNZOOMED);
    setPanning(false);
  }

  /** The canvas's unzoomed size on screen, and the client-to-CSS pixel ratio. */
  const measure = useCallback((): { frame: FrameSize; ratio: number } | null => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return null;
    const rect = stage.getBoundingClientRect();
    // Client pixels differ from CSS pixels under an emulated or scaled viewport.
    const ratio = rect.width > 0 ? stage.offsetWidth / rect.width : 1;
    const frame = turned
      ? { width: canvas.offsetHeight, height: canvas.offsetWidth }
      : { width: canvas.offsetWidth, height: canvas.offsetHeight };
    return { frame, ratio };
  }, [canvasRef, stageRef, turned]);

  // Native and non-passive: React's wheel listener is passive, so it could not stop the page
  // scrolling under the zoom.
  useEffect(() => {
    const stage = stageRef.current;
    if (!active || !stage) return;
    const onWheel = (event: WheelEvent) => {
      const pixels = wheelPixels(event);
      if (pixels === 0) return;
      event.preventDefault();
      if (event.altKey) {
        onAltWheelRef.current?.(pixels < 0 ? 1 : -1);
        return;
      }
      const measured = measure();
      if (!measured) return;
      const rect = stage.getBoundingClientRect();
      const point = {
        x: (event.clientX - (rect.left + rect.width / 2)) * measured.ratio,
        y: (event.clientY - (rect.top + rect.height / 2)) * measured.ratio,
      };
      setView((current) => zoomAt(current, wheelZoomFactor(pixels), point, measured.frame));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [active, measure, onAltWheelRef, stageRef]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!active || event.button !== MIDDLE_BUTTON) return;
      // Also stops the compatibility mousedown, which would start the browser's autoscroll.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { x: event.clientX, y: event.clientY };
      setPanning(true);
    },
    [active],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const last = panRef.current;
      if (!last) return;
      const measured = measure();
      if (!measured) return;
      const dx = (event.clientX - last.x) * measured.ratio;
      const dy = (event.clientY - last.y) * measured.ratio;
      panRef.current = { x: event.clientX, y: event.clientY };
      setView((current) => panBy(current, dx, dy, measured.frame));
    },
    [measure],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!panRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    setPanning(false);
  }, []);

  const reset = useCallback(() => setView(UNZOOMED), []);

  return { view, panning, onPointerDown, onPointerMove, onPointerUp, reset };
}
