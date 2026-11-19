import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import type { ScrollLockClass } from "@/shared/hooks/scrollLockManager";
import { classNames } from "@/shared/lib/classNames";
import { closeCodeEditorSearchPanel } from "@/shared/lib/codeEditorSearch";
import { snapshotDialogExit } from "@/shared/lib/dialogExitGhost";
import { EXIT_FALLBACK_MS } from "@/shared/lib/motion";
import { registerModalDialog } from "@/shared/lib/modalDialogs";
import { useLatestRef } from "@/shared/hooks/useLatestRef";
import type { GuardedAction } from "@/shared/hooks/useDiscardChanges";
import { DialogCancelContext } from "./dialogCancelContext";
import { DialogHostContext } from "./dialogHostContext";
import { DialogSuspendedContext } from "./dialogSuspendedContext";
import { DialogSubmissionContext } from "./dialogSubmissionContext";

export type DialogEscape = "close" | "editor" | "none";

/** Each dialog element's latest opening, so StrictMode's rehearsal close plays no exit. */
const openings = new WeakMap<HTMLDialogElement, number>();

/** How far off the panel's centre the opener may pull its scale origin. */
const OPENER_REACH = 600;

/** Points the panel's scale-in at the control that opened it, so it grows from where it came. */
function aimAtOpener(dialog: HTMLDialogElement, opener: Element | null) {
  const panel = dialog.querySelector<HTMLElement>(":scope > .dialog-panel");
  if (!panel || !(opener instanceof HTMLElement) || opener === document.body) return;
  if (dialog.contains(opener)) return;
  const from = opener.getBoundingClientRect();
  if (from.width === 0 && from.height === 0) return;
  const box = panel.getBoundingClientRect();
  const reach = (offset: number) => Math.max(-OPENER_REACH, Math.min(OPENER_REACH, offset));
  const x = panel.offsetWidth / 2 + reach(from.left + from.width / 2 - box.left - box.width / 2);
  const y = panel.offsetHeight / 2 + reach(from.top + from.height / 2 - box.top - box.height / 2);
  panel.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
}

interface DialogShellProps {
  block: string;
  role?: "dialog" | "alertdialog";
  panelId?: string;
  panelClassName?: string;
  label?: string;
  labelledById?: string;
  describedById?: string;
  onClose: () => void;
  onCancelAction?: (action: GuardedAction) => Promise<void>;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
  busy?: boolean;
  suspended?: boolean;
  escape?: DialogEscape;
  scrollLock?: ScrollLockClass;
  enterAnimation?: "fade-lift" | "none";
  closing?: boolean;
  onExited?: () => void;
  backdropLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  style?: CSSProperties;
}

export function DialogShell({
  block,
  role = "dialog",
  panelId,
  panelClassName,
  label,
  labelledById,
  describedById,
  onClose,
  onCancelAction,
  onKeyDown,
  busy = false,
  suspended: locallySuspended = false,
  escape = "close",
  scrollLock = "dialog-open",
  enterAnimation = "fade-lift",
  closing = false,
  onExited,
  backdropLabel = "Close",
  initialFocusRef,
  panelRef,
  children,
  style,
}: DialogShellProps) {
  const parentSuspended = useContext(DialogSuspendedContext);
  const parentDialog = useContext(DialogHostContext);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const suspended = parentSuspended || locallySuspended;
  const dismissible = !busy && !suspended && !closing;
  const initialFocus = useLatestRef(initialFocusRef);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const wasSuspendedRef = useRef(suspended);
  // A shell that animates its own exit (`onExited`), or never fades in, plays no exit copy.
  const fadesOut = useLatestRef(enterAnimation === "fade-lift" && !onExited);

  useScrollLock(true, scrollLock);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let active = true;
    let unregister: (() => void) | undefined;
    const opening = (openings.get(dialog) ?? 0) + 1;
    openings.set(dialog, opening);
    // Read at cleanup: whether the dialog still fades out by the time it closes.
    const exitAllowed = fadesOut;
    const open = () => {
      if (!active || dialog.open) return;
      // Descendant effects run first, including when several dialog levels mount together.
      if (parentDialog && !parentDialog.current?.open) {
        queueMicrotask(open);
        return;
      }
      const opener = document.activeElement;
      dialog.showModal();
      unregister = registerModalDialog(dialog);
      if (fadesOut.current) aimAtOpener(dialog, opener);
      (initialFocus.current?.current ?? dialog).focus({ preventScroll: true });
    };
    open();
    return () => {
      active = false;
      const playExit = exitAllowed.current ? snapshotDialogExit(dialog) : null;
      dialog.close();
      unregister?.();
      // StrictMode's rehearsal unmount keeps the node and opens again; only a real removal plays.
      if (playExit) {
        queueMicrotask(() => {
          if (!dialog.isConnected && openings.get(dialog) === opening) playExit();
        });
      }
    };
  }, [fadesOut, initialFocus, parentDialog]);

  useLayoutEffect(() => {
    const resumed = wasSuspendedRef.current && !suspended;
    wasSuspendedRef.current = suspended;
    if (!resumed) return;
    let active = true;
    // Native close runs before React removes the parent's inert attribute during the commit.
    queueMicrotask(() => {
      const dialog = dialogRef.current;
      if (!active || !dialog?.open || dialog.contains(document.activeElement)) return;
      const previous = lastFocusedRef.current;
      (previous?.isConnected ? previous : dialog).focus({ preventScroll: true });
    });
    return () => {
      active = false;
    };
  }, [suspended]);

  const exitedRef = useLatestRef(onExited);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => exitedRef.current?.(), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing, exitedRef]);

  return createPortal(
    /* oxlint-disable-next-line
       jsx-a11y/no-noninteractive-element-interactions
       -- a dialog handles its own keys */
    <dialog
      ref={dialogRef}
      id={panelId}
      className={classNames("dialog-surface", block)}
      role={role}
      aria-label={label}
      aria-labelledby={labelledById}
      aria-describedby={describedById}
      aria-hidden={suspended || undefined}
      inert={suspended}
      style={style}
      onFocusCapture={(event) => {
        if (event.currentTarget.contains(event.target)) lastFocusedRef.current = event.target;
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        if (dismissible && escape !== "none") onClose();
      }}
      onKeyDown={(event) => {
        if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
        // Reverse tab from the initially focused dialog should enter its final control.
        if (event.key === "Tab" && event.shiftKey && event.target === event.currentTarget) {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button, input, select, textarea, a[href], [tabindex], [contenteditable='true']",
            ),
          ].filter(
            (control) =>
              control.tabIndex >= 0 &&
              !control.matches(":disabled") &&
              control.getClientRects().length > 0,
          );
          event.preventDefault();
          controls.at(-1)?.focus();
          return;
        }
        if (event.key === "Escape" && escape === "editor") {
          if (closeCodeEditorSearchPanel(event.currentTarget)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
        onKeyDown?.(event);
      }}
    >
      <button
        type="button"
        className={classNames(
          "dialog-backdrop",
          `${block}__backdrop`,
          closing && "dialog-backdrop--exit",
        )}
        onClick={onClose}
        aria-label={backdropLabel}
        aria-hidden="true"
        disabled={!dismissible}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        className={classNames(
          "dialog-panel",
          `${block}__panel`,
          !closing && enterAnimation === "fade-lift" && "dialog-panel--enter",
          closing && "dialog-panel--exit",
          panelClassName,
        )}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && closing) onExited?.();
        }}
        data-scroll-lock-allow
      >
        <DialogHostContext.Provider value={dialogRef}>
          <DialogSubmissionContext.Provider value={null}>
            <DialogCancelContext.Provider value={onCancelAction ?? null}>
              {children}
            </DialogCancelContext.Provider>
          </DialogSubmissionContext.Provider>
        </DialogHostContext.Provider>
      </div>
    </dialog>,
    document.body,
  );
}
