import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  cropAspectRatio,
  cropForAspect,
  type CropRect,
  type Size,
} from "@/features/gallery/lib/crop";
import type { MaskDraft } from "@/features/gallery/lib/mask";
import type { AdjustDraft } from "@/features/gallery/hooks/useColorAdjust";
import type { SizeFit, StyleEffect } from "@/shared/types";

/** The draft fields the image and video editors share. */
export interface PictureEditDraft extends AdjustDraft {
  masks: MaskDraft[];
  crop: CropRect;
  scale: number;
  fit: SizeFit | null;
  effect: StyleEffect | null;
}

interface EditDraftSetterOptions<D extends PictureEditDraft> {
  setDraft: Dispatch<SetStateAction<D>>;
  sourceRef: RefObject<Size>;
  setAspectId: (aspectId: string) => void;
  setCropActive: (active: boolean) => void;
}

/** Setters for the draft fields the image and video editors share. */
export function useEditDraftSetters<D extends PictureEditDraft>({
  setDraft,
  sourceRef,
  setAspectId,
  setCropActive,
}: EditDraftSetterOptions<D>) {
  const setMasks = useCallback(
    (update: (current: MaskDraft[]) => MaskDraft[]) => {
      setDraft((current) => ({ ...current, masks: update(current.masks) }));
    },
    [setDraft],
  );

  const setCrop = useCallback(
    (crop: CropRect) => {
      setDraft((current) => ({ ...current, crop }));
    },
    [setDraft],
  );

  // Owned here so it resets with the item and restores with a stored spec.
  const selectAspect = useCallback(
    (nextAspectId: string) => {
      setAspectId(nextAspectId);

      // Free only releases the lock; keep the rectangle the user already shaped.
      const ratio = cropAspectRatio(nextAspectId, sourceRef.current);
      if (ratio === null) return;

      setCropActive(true);
      // Frame fractions, so the source's own aspect divides out first.
      const frame = sourceRef.current.width / sourceRef.current.height;
      if (!Number.isFinite(frame) || frame <= 0) return;
      setDraft((current) => ({ ...current, crop: cropForAspect(ratio / frame) }));
    },
    [setAspectId, setCropActive, setDraft, sourceRef],
  );

  const setEffect = useCallback(
    (effect: StyleEffect | null) => {
      setDraft((current) => ({ ...current, effect }));
    },
    [setDraft],
  );

  const setScale = useCallback(
    (scale: number) => {
      setDraft((current) => ({ ...current, scale, fit: null }));
    },
    [setDraft],
  );

  const updateAdjust = useCallback(
    (change: (current: AdjustDraft) => AdjustDraft) => {
      setDraft((current) => ({
        ...current,
        ...change({ adjust: current.adjust, autoAdjust: current.autoAdjust }),
      }));
    },
    [setDraft],
  );

  return { setMasks, setCrop, selectAspect, setEffect, setScale, updateAdjust };
}
