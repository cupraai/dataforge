import { afterEach, describe, expect, it } from "vitest";
import {
  applyRememberedSound,
  parseVolume,
  previewMuted,
  previewVolume,
  rememberSound,
} from "./videoSound";

function mountedVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  // As React's `muted` prop leaves every element.
  video.muted = true;
  return video;
}

describe("videoSound", () => {
  afterEach(() => {
    previewMuted.set(true);
    previewVolume.set(1);
    delete (navigator as { userActivation?: unknown }).userActivation;
  });

  it("ignores the mount's own mute, then follows the controls both ways", () => {
    previewMuted.set(false);
    const video = mountedVideo();
    rememberSound(video);
    expect(previewMuted.get()).toBe(false);

    applyRememberedSound(video);
    video.muted = true;
    rememberSound(video);
    expect(previewMuted.get()).toBe(true);
  });

  it("puts a new video on the remembered volume and records a drag", () => {
    previewVolume.set(0.3);
    const video = mountedVideo();

    applyRememberedSound(video);
    rememberSound(video);
    expect(video.volume).toBe(0.3);

    video.volume = 0.7;
    rememberSound(video);
    expect(previewVolume.get()).toBe(0.7);
  });

  it("starts muted before the page's first gesture, without forgetting the setting", () => {
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: false },
    });
    previewMuted.set(false);
    const video = mountedVideo();

    applyRememberedSound(video);
    rememberSound(video);
    expect(video.muted).toBe(true);

    // A volume drag while forced muted must not record the forced mute.
    video.volume = 0.5;
    rememberSound(video);
    expect(previewMuted.get()).toBe(false);
    expect(previewVolume.get()).toBe(0.5);

    // Muting again after unmuting must still be remembered.
    video.muted = false;
    rememberSound(video);
    video.muted = true;
    rememberSound(video);
    expect(previewMuted.get()).toBe(true);
  });

  it.each([
    ["0", 0],
    ["0.25", 0.25],
    ["", 1],
    ["loud", 1],
    ["1.5", 1],
    [null, 1],
  ])("reads a stored volume of %j as %d", (raw, expected) => {
    expect(parseVolume(raw)).toBe(expected);
  });
});
