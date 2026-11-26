import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { AnchoredSide } from "@/shared/lib/anchoredPosition";
import { classNames } from "@/shared/lib/classNames";
import { DURATION_FAST_MS } from "@/shared/lib/motion";
import { ariaKeyShortcuts, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";

/** Gap kept between a bubble and the window edge. Tighter than a menu's, by design. */
const VIEWPORT_GUTTER = 8;
/** Matches the bubble's fade in `_tooltip.scss`; it stays mounted until that ends. */
const FADE_MS = DURATION_FAST_MS;
/** Sweeping along a toolbar: a bubble closed this recently lets the next one skip its delay. */
const WARM_MS = 300;

let dismissShownTooltip: (() => void) | null = null;
let warmUntil = 0;

function claimShownTooltip(dismiss: () => void) {
  if (dismissShownTooltip !== dismiss) dismissShownTooltip?.();
  dismissShownTooltip = dismiss;
}

function releaseShownTooltip(dismiss: () => void) {
  warmUntil = Date.now() + WARM_MS;
  if (dismissShownTooltip === dismiss) dismissShownTooltip = null;
}

interface TooltipChildProps {
  disabled?: boolean;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  "aria-keyshortcuts"?: string;
}

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<TooltipChildProps>;
  delay?: number;
  disabled?: boolean;
  /** Show the bubble immediately, e.g. after a click, without waiting for hover. */
  open?: boolean;
  /**
   * The key that runs the trigger: drawn after the content and announced on the trigger, so the
   * two cannot drift apart. The caller binds the key itself.
   */
  shortcut?: ShortcutDefinition;
  /** Preferred side of the trigger; the bubble flips only when that side cannot hold it. */
  placement?: AnchoredSide;
  /** Extra classes on the bubble, for content richer than a line of text. */
  bubbleClassName?: string;
  /** Shows only while the trigger's own box cuts its text off, for names an ellipsis may hide. */
  whenTruncated?: boolean;
}

/** The trigger element inside the wrapper, past any tooltip wrapped directly around it. */
function triggerOf(wrapper: HTMLElement | null): HTMLElement | null {
  let element = wrapper?.firstElementChild ?? null;
  while (element?.classList.contains("tooltip")) element = element.firstElementChild;
  return element instanceof HTMLElement ? element : null;
}

function isCutOff(element: HTMLElement | null): boolean {
  if (!element) return false;
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

export function Tooltip({
  content,
  children,
  delay = 400,
  disabled = false,
  open = false,
  shortcut,
  placement = "bottom",
  bubbleClassName,
  whenTruncated = false,
}: TooltipProps) {
  const id = useId();
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  // The wrapper draws no box, so the bubble points at the trigger inside it.
  const anchorRef = useMemo(
    () => ({
      get current() {
        return triggerOf(wrapperRef.current);
      },
    }),
    [],
  );
  const [visible, setVisible] = useState(false);
  const [openDismissed, setOpenDismissed] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setOpenDismissed(false);
  }
  const childExpanded = isValidElement(children) && children.props["aria-expanded"] === true;

  const clearShowTimeout = useCallback(() => {
    if (showTimeoutRef.current !== undefined) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = undefined;
    }
  }, []);

  const stopScrollWatchRef = useRef<(() => void) | undefined>(undefined);

  const stopScrollWatch = useCallback(() => {
    stopScrollWatchRef.current?.();
    stopScrollWatchRef.current = undefined;
  }, []);

  const hasContent = content != null && content !== "";

  const show = useCallback((): boolean => {
    if (disabled || childExpanded || !hasContent) return false;
    // Measured when the pointer or focus arrives, so a resize since the last render counts.
    if (whenTruncated && !isCutOff(triggerOf(wrapperRef.current))) return false;
    clearShowTimeout();
    const wait = Date.now() < warmUntil ? 0 : delay;
    showTimeoutRef.current = setTimeout(() => setVisible(true), wait);
    return true;
  }, [childExpanded, clearShowTimeout, delay, disabled, hasContent, whenTruncated]);

  const hide = useCallback(() => {
    clearShowTimeout();
    stopScrollWatch();
    setVisible(false);
  }, [clearShowTimeout, stopScrollWatch]);

  // Scrolling closes a hover bubble; a focus bubble stays.
  const showOnHover = useCallback(() => {
    if (!show() || stopScrollWatchRef.current) return;
    const onScroll = () => hide();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    stopScrollWatchRef.current = () =>
      document.removeEventListener("scroll", onScroll, { capture: true });
  }, [hide, show]);

  // A nested trigger owns the hover; this one returns with the pointer.
  const steppedAsideRef = useRef(false);
  const handleMouseOver = useCallback(
    (event: MouseEvent<HTMLSpanElement>) => {
      const wrapper = wrapperRef.current;
      // The bubble is portalled, so its events arrive here too; it is no part of the trigger.
      if (!wrapper || !(event.target instanceof Element) || !wrapper.contains(event.target)) {
        return;
      }
      const owner = event.target.closest(".tooltip");
      if (owner !== wrapper) {
        steppedAsideRef.current = true;
        hide();
      } else if (steppedAsideRef.current) {
        steppedAsideRef.current = false;
        showOnHover();
      }
    },
    [hide, showOnHover],
  );

  const handleMouseLeave = useCallback(() => {
    steppedAsideRef.current = false;
    hide();
  }, [hide]);

  const showOnFocus = useCallback(() => {
    stopScrollWatch();
    show();
  }, [show, stopScrollWatch]);

  const dismiss = useCallback(() => {
    hide();
    setOpenDismissed(true);
  }, [hide]);

  // Hover must not cover a menu/drawer this trigger just opened; forced `open` still wins.
  const shown =
    !disabled && hasContent && ((open && !openDismissed) || (visible && !childExpanded));

  useLayoutEffect(() => {
    if (!shown) return;
    claimShownTooltip(dismiss);
    return () => releaseShownTooltip(dismiss);
  }, [dismiss, shown]);

  useEffect(
    () => () => {
      clearShowTimeout();
      stopScrollWatch();
    },
    [clearShowTimeout, stopScrollWatch],
  );

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- hide also clears timers
    if (childExpanded) hide();
  }, [childExpanded, hide]);

  if (!isValidElement(children)) {
    return children;
  }

  const childProps = children.props;
  const childDisabled = Boolean(childProps.disabled);
  const childAriaLabel = childProps["aria-label"];
  const tooltipDuplicatesLabel =
    typeof childAriaLabel === "string" && typeof content === "string" && childAriaLabel === content;
  const describedBy = shown && !tooltipDuplicatesLabel ? id : undefined;
  const ariaDescribedBy =
    [childProps["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined;

  const focusHandlers = !childDisabled
    ? {
        onFocus: (event: FocusEvent) => {
          childProps.onFocus?.(event);
          showOnFocus();
        },
        onBlur: (event: FocusEvent) => {
          childProps.onBlur?.(event);
          hide();
        },
      }
    : {};

  // The handlers are only attached here; the refs they read are touched when focus moves.
  // oxlint-disable-next-line react-hooks/refs
  const triggerElement = cloneElement(children, {
    "aria-describedby": ariaDescribedBy,
    // A key the trigger names itself wins, as on Button and IconButton.
    "aria-keyshortcuts":
      childProps["aria-keyshortcuts"] ?? (shortcut ? ariaKeyShortcuts(shortcut) : undefined),
    ...focusHandlers,
  });

  // `display: contents`: the trigger lays out as if unwrapped, and its hover still lands here.
  return (
    /* oxlint-disable-next-line
       jsx-a11y/click-events-have-key-events,
       jsx-a11y/no-static-element-interactions
       -- pointer-only wrapper */
    <span
      ref={wrapperRef}
      className="tooltip"
      onMouseEnter={showOnHover}
      /* oxlint-disable-next-line
         jsx-a11y/mouse-events-have-key-events
         -- focus handlers sit on the trigger */
      onMouseOver={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      onPointerDown={hide}
      onClick={hide}
    >
      {triggerElement}
      <AnchoredLayer
        anchorRef={anchorRef}
        open={shown}
        placement={`${placement}-center`}
        offset={8}
        gutter={VIEWPORT_GUTTER}
        exitDuration={FADE_MS}
        className={classNames("tooltip__bubble", bubbleClassName)}
        id={id}
        role="tooltip"
      >
        {shortcut ? <ShortcutHint shortcut={shortcut}>{content}</ShortcutHint> : content}
        <span className="tooltip__arrow" aria-hidden="true" />
      </AnchoredLayer>
    </span>
  );
}
