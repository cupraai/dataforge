import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StageHintSlot } from "@/features/gallery/lib/stageHintSlot";
import type { AppIcon } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { formatChord } from "@/shared/lib/shortcuts";
import type { StageGesture } from "@/features/gallery/lib/toolHints";
import { Icon } from "@/shared/ui/Icon";
import { KeyCap, ShortcutKeys } from "@/shared/ui/ShortcutKeys";

/** How near the pointer may come, in CSS pixels, before the hint clears out of its way. */
const CLEAR_MARGIN = 12;

export type StageHintTone = "info" | "busy" | "done" | "warning" | "error";

interface StageHintProps {
  icon: AppIcon;
  message: string;
  tone?: StageHintTone;
  gestures?: readonly StageGesture[];
  /** Read out as it changes, for a hint that reports progress. */
  status?: boolean;
  /** Beside the message, outside any status, such as a running clock. */
  aside?: ReactNode;
}

/**
 * How the open tool is used, over the bottom of the media where the work happens. Shown in the
 * dialog's stage slot, so without one, as in a panel rendered alone, it shows nothing.
 *
 * It never takes the pointer, or it would block the handles and brush under it; so it watches
 * the pointer over the stage instead, and clears while the pointer is over its box.
 */
export function StageHint({
  icon,
  message,
  tone = "info",
  gestures,
  status = false,
  aside,
}: StageHintProps) {
  const slot = useContext(StageHintSlot);
  const hintRef = useRef<HTMLDivElement>(null);
  const [clear, setClear] = useState(false);

  useEffect(() => {
    const stage = slot?.parentElement;
    if (!stage) return;
    // Moves bubble here from a captured drag too, so a stroke into the hint still clears it.
    const onMove = (event: PointerEvent) => {
      const box = hintRef.current?.getBoundingClientRect();
      setClear(
        box !== undefined &&
          event.clientX >= box.left - CLEAR_MARGIN &&
          event.clientX <= box.right + CLEAR_MARGIN &&
          event.clientY >= box.top - CLEAR_MARGIN &&
          event.clientY <= box.bottom + CLEAR_MARGIN,
      );
    };
    const onLeave = () => setClear(false);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, [slot]);

  if (!slot) return null;

  return createPortal(
    <div
      ref={hintRef}
      className={classNames("stage-hint", `stage-hint--${tone}`, clear && "stage-hint--clear")}
    >
      <div className="stage-hint__line">
        <Icon icon={icon} className="stage-hint__icon" spin={tone === "busy"} />
        <p className="stage-hint__message" role={status ? "status" : undefined}>
          {message}
        </p>
        {aside}
      </div>
      {/* The controls name their own keys; this is the reminder for eyes on the media. */}
      {gestures && gestures.length > 0 && (
        <ul className="stage-hint__keys" aria-hidden="true">
          {gestures.map((entry) => (
            <li key={entry.does} className="stage-hint__key">
              {"shortcut" in entry ? (
                <ShortcutKeys shortcut={entry.shortcut} />
              ) : "keys" in entry ? (
                // Labelled as the registered shortcuts are, so Enter reads the same everywhere.
                entry.keys
                  .flatMap((key) => formatChord({ key }))
                  .map((label) => <KeyCap key={label} label={label} />)
              ) : (
                <span className="stage-hint__gesture">{entry.gesture}</span>
              )}
              {entry.does}
            </li>
          ))}
        </ul>
      )}
    </div>,
    slot,
  );
}
