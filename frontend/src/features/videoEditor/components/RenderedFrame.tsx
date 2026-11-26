import { IconButton } from "@/shared/ui/IconButton";
import { iconX } from "@/shared/icons";

export interface RenderedFrameState {
  url: string;
  timecode: string;
  width: number;
  height: number;
}

/** The export renderer's own picture of one frame, laid over the live preview until closed. */
export function RenderedFrame({
  frame,
  onClose,
}: {
  frame: RenderedFrameState;
  onClose: () => void;
}) {
  return (
    <>
      <img
        className="video-editor__rendered-frame"
        src={frame.url}
        alt={`Export render at ${frame.timecode}`}
      />
      <span className="video-editor__rendered-bar" role="status">
        <span>
          Export render · {frame.timecode} · {frame.width} × {frame.height}
        </span>
        <a className="video-editor__link-btn" href={frame.url} target="_blank" rel="noreferrer">
          Full size
        </a>
        <IconButton
          icon={iconX}
          label="Back to the live preview"
          onClick={onClose}
          size="xs"
          variant="ghost"
        />
      </span>
    </>
  );
}
