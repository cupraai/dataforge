import { createStoredStore } from "@/shared/lib/storedStore";

/** Whether the viewer, inspector and edit previews start muted; one setting for all of them. */
export const previewMuted = createStoredStore("video-preview-muted", (raw) => raw !== "false");

/** A stored volume, or full volume for anything a media element would refuse. */
export function parseVolume(raw: string | null): number {
  const volume = raw === null ? Number.NaN : Number.parseFloat(raw);
  return volume >= 0 && volume <= 1 ? volume : 1;
}

/** The viewer's and inspector's volume. Edit mode plays at the edit's own volume instead. */
export const previewVolume = createStoredStore("video-preview-volume", parseVolume);

interface Sound {
  muted: boolean;
  volume: number;
}

// Elements mount with React's `muted` prop and the default volume.
const MOUNTED: Sound = { muted: true, volume: 1 };
// What this module last set or recorded on each element.
const applied = new WeakMap<HTMLMediaElement, Sound>();

/** Puts a freshly loaded `video` on the remembered setting. */
export function applyRememberedSound(video: HTMLMediaElement): void {
  // Unmuted autoplay is refused before the page's first gesture, as right after a reload.
  const activated = !("userActivation" in navigator) || navigator.userActivation.hasBeenActive;
  const sound = { muted: previewMuted.get() || !activated, volume: previewVolume.get() };
  applied.set(video, sound);
  video.muted = sound.muted;
  video.volume = sound.volume;
}

/** From `volumechange`; our own assignments arrive later with values already recorded. */
export function rememberSound(video: HTMLMediaElement): void {
  const last = applied.get(video) ?? MOUNTED;
  const { muted, volume } = video;
  applied.set(video, { muted, volume });
  // Per field, so a volume drag before the first gesture cannot record the forced mute.
  if (muted !== last.muted) previewMuted.set(muted);
  if (volume !== last.volume) previewVolume.set(volume);
}
