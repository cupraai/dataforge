import type { Ref, VideoHTMLAttributes } from "react";
import { useMediaPlaybackProblem } from "@/shared/hooks/useMediaPlaybackProblem";
import { MediaProblemNotice } from "@/shared/ui/MediaProblemNotice";

type PlaybackCheckedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string;
  videoRef?: Ref<HTMLVideoElement>;
};

/** A `<video>` that says why it cannot play, with Retry; its parent must be positioned. */
export function PlaybackCheckedVideo({
  src,
  videoRef,
  onLoadedMetadata,
  ...props
}: PlaybackCheckedVideoProps) {
  const playback = useMediaPlaybackProblem(src);
  return (
    <>
      <video
        key={playback.retryKey}
        ref={videoRef}
        src={src}
        {...props}
        {...playback.mediaProps}
        onLoadedMetadata={(event) => {
          playback.noteMetadata(event.currentTarget);
          onLoadedMetadata?.(event);
        }}
      />
      {playback.problem && (
        <MediaProblemNotice problem={playback.problem} onRetry={playback.retry} />
      )}
    </>
  );
}
