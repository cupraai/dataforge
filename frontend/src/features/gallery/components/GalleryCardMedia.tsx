import { useEffect, useRef, useState, type CSSProperties } from "react";
import { galleryItemMediaUrl } from "@/features/gallery/lib/thumbnail";
import { useGalleryCardMedia } from "@/features/gallery/hooks/useGalleryCardMedia";
import {
  iconAudioLines,
  iconFileImage,
  iconImage,
  iconModel,
  iconVideo,
  type AppIcon,
} from "@/shared/icons";
import type { GalleryItem } from "@/shared/types";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import { AudioWaveform } from "./AudioWaveform";

const PREVIEW_PLAYBACK_RATE = 2;

type MediaItem = Pick<
  GalleryItem,
  "path" | "modified_at" | "size" | "media_type" | "name" | "placeholder_color"
>;

const PLACEHOLDER_ICONS: Record<GalleryItem["media_type"], AppIcon> = {
  image: iconImage,
  gif: iconFileImage,
  video: iconVideo,
  audio: iconAudioLines,
  model: iconModel,
};

interface GalleryCardMediaProps {
  item: MediaItem;
  previewing?: boolean;
  /** A blurred copy of the thumbnail behind it, filling the sides a contained one leaves empty. */
  backdrop?: boolean;
}

export function GalleryCardMedia({
  item,
  previewing = false,
  backdrop = false,
}: GalleryCardMediaProps) {
  const itemIsVideo = item.media_type === "video";
  const itemIsGif = item.media_type === "gif";
  const itemIsMotion = itemIsVideo || itemIsGif;
  const itemIsAudio = item.media_type === "audio";
  const { containerRef, imageRef, showImage, ready, src, handleReady, handleError } =
    useGalleryCardMedia(item);
  // The store only reports a source once its own preload has decoded it, so a mask needs no onLoad.
  const painted = showImage && (ready || itemIsAudio);
  // Stands in only until a thumbnail paints; a contained one then sits on the plain media well.
  const color = painted ? undefined : item.placeholder_color;
  const surfaceStyle = color ? ({ "--placeholder-color": color } as CSSProperties) : undefined;

  return (
    <div
      ref={containerRef}
      className={classNames("card__media-surface", color && "card__media-surface--colored")}
      style={surfaceStyle}
      aria-hidden="true"
    >
      {!painted && !color && (
        <div className="card__media-placeholder">
          <Icon
            icon={PLACEHOLDER_ICONS[item.media_type]}
            className="card__media-placeholder-icon"
          />
        </div>
      )}
      {backdrop && showImage && !itemIsAudio && (
        // Before the thumbnail, so it paints underneath; it reuses the thumbnail's decoded source.
        <img
          className={classNames("card__backdrop", ready && "card__backdrop--ready")}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
        />
      )}
      {showImage && itemIsAudio && <AudioWaveform src={src!} className="card__waveform" />}
      {showImage && !itemIsAudio && (
        <img
          ref={imageRef}
          className={classNames(
            "card__img",
            ready && "card__img--ready",
            itemIsMotion && "card__video",
            ready && itemIsMotion && "card__video--ready",
          )}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={handleReady}
          onError={handleError}
        />
      )}
      {previewing && itemIsVideo && <CardVideoPreview item={item} />}
    </div>
  );
}

function CardVideoPreview({ item }: { item: MediaItem }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = galleryItemMediaUrl(item);

  // The effect owns src: the cleanup strips it, and a JSX prop would not put it back on replay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // React does not reliably reflect `muted`, and autoplay is only allowed when it is set.
    video.muted = true;
    // Loading a source resets playbackRate to the default, so the default carries the speed.
    video.defaultPlaybackRate = PREVIEW_PLAYBACK_RATE;
    video.playbackRate = PREVIEW_PLAYBACK_RATE;
    video.src = src;
    video.play()?.catch(() => {});

    return () => {
      // Unmounting alone lets the in-flight range request finish in the background.
      video.pause();
      video.removeAttribute("src");
      video.load();
      setPlaying(false);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={classNames("card__video-preview", playing && "card__video-preview--ready")}
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      onPlaying={() => setPlaying(true)}
    />
  );
}
