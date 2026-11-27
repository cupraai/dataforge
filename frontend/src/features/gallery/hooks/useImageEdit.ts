import { useCallback, useEffect, useState } from "react";
import {
  applyImageEdit,
  fetchImageAutoAdjust,
  fetchImageEditState,
  revertImageEdit,
} from "@/features/gallery/api/imageEdit";
import {
  aspectIdForCrop,
  cropAspectRatio,
  type CropRect,
  type Orientation,
} from "@/features/gallery/lib/crop";
import { useColorAdjust, type ColorAdjustControls } from "@/features/gallery/hooks/useColorAdjust";
import { useImageFill, type ImageFillControls } from "@/features/gallery/hooks/useImageFill";
import { useMaskRegions, type MaskRegionControls } from "@/features/gallery/hooks/useMaskRegions";
import {
  draftFromSpec,
  emptyDraft,
  isIdentityEdit,
  orientationOf,
  outputDimensions,
  rotateBy,
  specsEqual,
  toImageEditSpec,
  type ImageEditDraft,
} from "@/features/gallery/lib/imageEdit";
import { useEditRun } from "@/features/gallery/hooks/useEditRun";
import { useEditDraftSetters } from "@/features/gallery/hooks/useEditDraftSetters";
import type { GalleryItem, StyleEffect, ImageEditSpec, ImageFill } from "@/shared/types";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import { useChanged } from "@/shared/hooks/useChanged";

export interface UseImageEditOptions {
  item: GalleryItem | undefined;
  onEdited?: () => void | Promise<void>;
  /** Owned by the dialog so the mode sticks across next/prev. */
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
}

export interface ImageEdit extends MaskRegionControls {
  editMode: boolean;
  ready: boolean;
  applying: boolean;
  draft: ImageEditDraft;
  sourceWidth: number;
  sourceHeight: number;
  hasBackup: boolean;
  dirty: boolean;
  cropActive: boolean;
  aspectId: string;
  aspectRatio: number | null;
  orientation: Orientation;
  outputWidth: number;
  outputHeight: number;
  toggleEditMode: () => void;
  exitEditMode: () => void;
  setCrop: (crop: CropRect) => void;
  setCropActive: (active: boolean) => void;
  selectAspect: (aspectId: string) => void;
  rotateClockwise: () => void;
  rotateCounterClockwise: () => void;
  toggleMirrorH: () => void;
  toggleMirrorV: () => void;
  setEffect: (effect: StyleEffect | null) => void;
  setScale: (scale: number) => void;
  adjust: ColorAdjustControls;
  fill: ImageFillControls;
  fillActive: boolean;
  setFillActive: (active: boolean) => void;
  /** Drops the newest kept fill; earlier ones cannot go without the ones built on them. */
  undoFill: () => void;
  /** Unsaved work Apply would not take: an Auto measurement, a fill run or an undecided result. */
  pending: boolean;
  resetDraft: () => void;
  apply: () => void;
  revert: () => void;
  handleLoad: (image: HTMLImageElement) => void;
}

export function useImageEdit(options: UseImageEditOptions): ImageEdit {
  const { item, editMode, setEditMode } = options;

  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [draft, setDraft] = useState<ImageEditDraft>(emptyDraft);
  // On-disk spec, kept apart so dirty can compare and one can survive a re-seed alone.
  const [savedSpec, setSavedSpec] = useState<ImageEditSpec | null>(null);
  const [aspectId, setAspectId] = useState("free");
  const [cropActive, setCropActive] = useState(false);
  const [fillActive, setFillActive] = useState(false);
  // The saved spec has been read; editing before then would apply a draft missing it.
  const [stateLoaded, setStateLoaded] = useState(false);

  const draftRef = useLatestRef(draft);
  const savedSpecRef = useLatestRef(savedSpec);
  const sourceRef = useLatestRef({ width: sourceWidth, height: sourceHeight });

  const { setMasks, setCrop, selectAspect, setEffect, setScale, updateAdjust } =
    useEditDraftSetters({ setDraft, sourceRef, setAspectId, setCropActive });

  const {
    clearSelection: clearMaskSelection,
    deactivate: deactivateMasks,
    ...maskControls
  } = useMaskRegions(draft.masks, setMasks);

  const path = item?.path;
  const sized = sourceWidth > 0 && sourceHeight > 0;
  const ready = sized && stateLoaded;
  const {
    applying,
    hasBackup,
    setHasBackup,
    applyingRef,
    mountedRef,
    run: runEdit,
  } = useEditRun({ item, onEdited: options.onEdited, ready });

  // Keyed on path alone; has_backup, applying and cropActive would race paging.
  if (useChanged(path)) {
    setSourceWidth(0);
    setSourceHeight(0);
    setDraft(emptyDraft());
    setSavedSpec(null);
    setStateLoaded(false);
    setAspectId("free");
    clearMaskSelection();
  }

  const handleLoad = useCallback((image: HTMLImageElement) => {
    setSourceWidth(image.naturalWidth);
    setSourceHeight(image.naturalHeight);
  }, []);

  const seedDraft = useCallback(
    (spec: ImageEditSpec | null) => {
      const seeded = draftFromSpec(spec);
      setDraft(seeded);
      setAspectId(aspectIdForCrop(seeded.crop, sourceRef.current));
      clearMaskSelection();
    },
    [clearMaskSelection, sourceRef],
  );

  // Wait for a real size; keyed on path so a refresh keeps the draft.
  const loadPath = editMode && sized ? path : undefined;
  if (useChanged(loadPath) && loadPath) setStateLoaded(false);
  useEffect(() => {
    if (!editMode || !path || !sized) return;

    let cancelled = false;
    void (async () => {
      try {
        const state = await fetchImageEditState(path);
        if (cancelled || !mountedRef.current) return;
        setHasBackup(state.has_backup);
        setSavedSpec(state.spec ?? null);
        seedDraft(state.spec ?? null);
      } catch {
        // Missing spec: open on an empty draft like an unedited file.
      }
      if (!cancelled && mountedRef.current) setStateLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [editMode, mountedRef, path, seedDraft, setHasBackup, sized]);

  const turn = useCallback((turns: number) => {
    setDraft((current) => ({ ...current, rotate: rotateBy(current.rotate, turns) }));
  }, []);

  const rotateClockwise = useCallback(() => turn(1), [turn]);
  const rotateCounterClockwise = useCallback(() => turn(-1), [turn]);

  const toggleMirrorH = useCallback(() => {
    setDraft((current) => ({ ...current, mirrorH: !current.mirrorH }));
  }, []);

  const toggleMirrorV = useCallback(() => {
    setDraft((current) => ({ ...current, mirrorV: !current.mirrorV }));
  }, []);

  const requestSuggestion = useCallback(
    async (mediaPath: string) =>
      (await fetchImageAutoAdjust(mediaPath, toImageEditSpec(draftRef.current))).suggestion,
    [draftRef],
  );

  const adjust = useColorAdjust({
    draft,
    update: updateAdjust,
    path,
    name: item?.name,
    requestSuggestion,
  });
  const { cancelAuto } = adjust;

  const keepFill = useCallback((kept: ImageFill) => {
    setDraft((current) => ({ ...current, fills: [...current.fills, kept] }));
  }, []);

  const undoFill = useCallback(() => {
    setDraft((current) => ({ ...current, fills: current.fills.slice(0, -1) }));
  }, []);

  const fill = useImageFill({
    path,
    source: { width: sourceWidth, height: sourceHeight },
    fills: draft.fills,
    open: editMode && fillActive && stateLoaded,
    onKeep: keepFill,
  });
  const { reset: resetFill } = fill;
  const fillPendingRef = useLatestRef(fill.pending);

  const resetDraft = useCallback(() => {
    cancelAuto();
    resetFill();
    seedDraft(savedSpecRef.current);
  }, [cancelAuto, resetFill, savedSpecRef, seedDraft]);

  const exitEditMode = useCallback(() => {
    cancelAuto();
    resetFill();
    setCropActive(false);
    setFillActive(false);
    deactivateMasks();
    setEditMode(false);
  }, [cancelAuto, deactivateMasks, resetFill, setEditMode]);

  const toggleEditMode = useCallback(() => {
    if (applyingRef.current) return;
    if (editMode) {
      exitEditMode();
      return;
    }
    setEditMode(true);
  }, [applyingRef, editMode, exitEditMode, setEditMode]);

  const revert = useCallback(() => {
    cancelAuto();
    resetFill();
    runEdit(
      revertImageEdit,
      (name) => `Restored the original ${name}.`,
      () => {
        setSavedSpec(null);
        seedDraft(null);
      },
    );
  }, [cancelAuto, resetFill, runEdit, seedDraft]);

  const apply = useCallback(() => {
    // Keep or discard the result first: Apply never generates, and never drops one unasked.
    if (fillPendingRef.current) return;
    cancelAuto();
    const currentDraft = draftRef.current;

    // Identity draft restores the backup instead of re-encoding; else only Revert returns upright.
    if (isIdentityEdit(currentDraft)) {
      revert();
      return;
    }

    const spec = toImageEditSpec(currentDraft);
    const size = outputDimensions(
      sourceRef.current,
      currentDraft.crop,
      currentDraft.rotate,
      currentDraft.scale,
      currentDraft.fit,
    );

    runEdit(
      (mediaPath) => applyImageEdit(mediaPath, spec),
      (name) => `Edited ${name} - ${size.width} x ${size.height}.`,
      () => setSavedSpec(spec),
    );
  }, [cancelAuto, draftRef, fillPendingRef, revert, runEdit, sourceRef]);

  // Dirty vs disk, not an untouched source: an identity draft after a write means Revert.
  const dirty =
    ready &&
    (savedSpec === null ? !isIdentityEdit(draft) : !specsEqual(toImageEditSpec(draft), savedSpec));

  const output = outputDimensions(
    { width: sourceWidth, height: sourceHeight },
    draft.crop,
    draft.rotate,
    draft.scale,
    draft.fit,
  );

  return {
    editMode,
    ready,
    applying,
    draft,
    sourceWidth,
    sourceHeight,
    hasBackup,
    dirty,
    cropActive,
    ...maskControls,
    aspectId,
    aspectRatio: cropAspectRatio(aspectId, { width: sourceWidth, height: sourceHeight }),
    orientation: orientationOf(draft),
    outputWidth: output.width,
    outputHeight: output.height,
    toggleEditMode,
    exitEditMode,
    setCrop,
    setCropActive,
    selectAspect,
    rotateClockwise,
    rotateCounterClockwise,
    toggleMirrorH,
    toggleMirrorV,
    setScale,
    setEffect,
    adjust,
    fill,
    fillActive,
    setFillActive,
    undoFill,
    pending: adjust.autoPending || fill.pending,
    resetDraft,
    apply,
    revert,
    handleLoad,
  };
}
