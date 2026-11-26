import { IconButton } from "@/shared/ui/IconButton";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { iconRotateCcw, type AppIcon } from "@/shared/icons";
import { DisclosureButton } from "@/shared/ui/Disclosure";
import { useChanged } from "@/shared/hooks/useChanged";
import { classNames } from "@/shared/lib/classNames";
import { readStoredJson, writeStoredJson } from "@/shared/lib/storage";
import { Icon } from "@/shared/ui/Icon";
import { rangeFill } from "@/shared/lib/rangeFill";
import { Slider } from "@/shared/ui/Slider";
import type { SliderUnit } from "@/features/videoEditor/lib/sliderUnits";
import type { Clip } from "@/features/videoEditor/lib/timeline";
import { Tooltip } from "@/shared/ui/Tooltip";

const SECTIONS_KEY = "video-editor-inspector-sections";

/** ``final`` is false while a control is still being dragged; only the final edit is recorded. */
export type ClipEdit = (patch: Partial<Clip>, final: boolean) => void;

/** Collapsed or open per section title, remembered across clips and sessions. */
const SectionContext = createContext<{
  isOpen: (title: string, fallback: boolean) => boolean;
  toggle: (title: string, fallback: boolean) => void;
}>({ isOpen: (_title, fallback) => fallback, toggle: () => undefined });

function parseSections(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

export function SectionMemory({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<Record<string, boolean>>(() =>
    readStoredJson(SECTIONS_KEY, parseSections, {}),
  );
  useEffect(() => writeStoredJson(SECTIONS_KEY, sections), [sections]);
  const isOpen = useCallback(
    (title: string, fallback: boolean) => sections[title] ?? fallback,
    [sections],
  );
  const toggle = useCallback((title: string, fallback: boolean) => {
    setSections((current) => ({ ...current, [title]: !(current[title] ?? fallback) }));
  }, []);
  return <SectionContext.Provider value={{ isOpen, toggle }}>{children}</SectionContext.Provider>;
}

export function InspectorHeader({
  icon,
  kind,
  title,
  meta,
  detail,
  actions,
}: {
  icon: AppIcon;
  kind: Clip["kind"] | "dissolve" | "multiple";
  title: string;
  meta: string;
  detail?: string;
  /** ``HeaderAction`` buttons for what applies to the whole selection. */
  actions?: ReactNode;
}) {
  return (
    <header
      className={classNames("video-editor__clip-header", `video-editor__clip-header--${kind}`)}
    >
      <span className="video-editor__clip-icon" aria-hidden="true">
        <Icon icon={icon} />
      </span>
      <div className="video-editor__clip-heading">
        <Tooltip content={title} whenTruncated>
          <h3 className="video-editor__clip-title">{title}</h3>
        </Tooltip>
        <p className="video-editor__clip-meta">{meta}</p>
        {detail && (
          <Tooltip content={detail} whenTruncated>
            <p className="video-editor__clip-meta">{detail}</p>
          </Tooltip>
        )}
      </div>
      {actions && <div className="video-editor__clip-actions">{actions}</div>}
    </header>
  );
}

export function HeaderAction({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: AppIcon;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <IconButton
      icon={icon}
      label={label}
      size="xs"
      variant="ghost"
      tone={danger ? "danger" : undefined}
      onClick={onClick}
    />
  );
}

/** A collapsible group; a dot marks one that holds changes. */
export function Panel({
  title,
  icon,
  action,
  changed = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: AppIcon;
  action?: ReactNode;
  changed?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { isOpen, toggle } = useContext(SectionContext);
  const open = isOpen(title, defaultOpen);
  const bodyId = useId();
  return (
    <section className="video-editor__section">
      <header className="video-editor__section-header">
        <h3 className="video-editor__section-heading">
          <DisclosureButton
            className="video-editor__section-toggle"
            open={open}
            controls={bodyId}
            label={title}
            icon={icon}
            onClick={() => toggle(title, defaultOpen)}
          >
            {changed && <span className="video-editor__section-changed" />}
          </DisclosureButton>
        </h3>
        {action}
      </header>
      {open && (
        <div id={bodyId} className="video-editor__section-body">
          {children}
        </div>
      )}
    </section>
  );
}

/** A folding group inside a panel, remembered under ``memoryKey``. */
export function Subgroup({
  title,
  memoryKey,
  changed = false,
  action,
  children,
}: {
  title: string;
  memoryKey: string;
  changed?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { isOpen, toggle } = useContext(SectionContext);
  const open = isOpen(memoryKey, true);
  const bodyId = useId();
  return (
    <div className="video-editor__subgroup">
      <div className="video-editor__subgroup-header">
        <h4 className="video-editor__subgroup-heading">
          <DisclosureButton
            className="video-editor__subgroup-toggle"
            variant="subsection"
            open={open}
            controls={bodyId}
            label={title}
            onClick={() => toggle(memoryKey, true)}
          >
            {changed && <span className="video-editor__section-changed" />}
          </DisclosureButton>
        </h4>
        {action}
      </div>
      {open && (
        <div id={bodyId} className="video-editor__subgroup-body">
          {children}
        </div>
      )}
    </div>
  );
}

export function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconButton icon={iconRotateCcw} label={label} onClick={onClick} size="xs" variant="ghost" />
  );
}

/** Two short sliders side by side, such as Position X and Y; stacked when either would truncate. */
export function SliderPair({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="video-editor__slider-pair" role="group" aria-label={label}>
      {label && (
        <span className="video-editor__slider-pair-label" aria-hidden="true">
          {label}
        </span>
      )}
      <div className="video-editor__slider-pair-grid">{children}</div>
    </div>
  );
}

interface InspectorSliderProps {
  label: string;
  /** Shown instead of ``label`` where a pair names the group, e.g. "X" under "Position". */
  short?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: SliderUnit;
  onChange: (value: number, final: boolean) => void;
  /** The untouched value: the fill grows from it, and the reset button returns to it. */
  resting?: number;
  /** Several clips are shown and differ; ``value`` is the first one's. */
  mixed?: boolean;
  /** A toggle at the end of the head row: a keyframe diamond, or a track's speech mark. */
  trailing?: ReactNode;
}

/**
 * Label, typed value and reset over a track; a release or key records one undo step.
 * Only a moved slider commits, or rounding would change the value and clear redo.
 */
export function InspectorSlider({
  label,
  short,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  resting,
  mixed = false,
  trailing,
}: InspectorSliderProps) {
  const id = useId();
  const movedRef = useRef(false);
  const settle = (event: { currentTarget: HTMLInputElement }) => {
    if (!movedRef.current) return;
    movedRef.current = false;
    onChange(Number(event.currentTarget.value), true);
  };
  const clamped = Math.min(max, Math.max(min, value));
  const changed = resting !== undefined && Math.abs(clamped - resting) > step / 2;
  const origin = resting !== undefined && resting >= min && resting <= max ? resting : min;
  const reset = () => {
    if (resting !== undefined && changed) onChange(resting, true);
  };
  return (
    <div
      className={classNames(
        "video-editor__slider",
        changed && "video-editor__slider--changed",
        mixed && "video-editor__slider--mixed",
      )}
    >
      <div className="video-editor__slider-head">
        <Tooltip content={short ? label : undefined}>
          <label htmlFor={id} onDoubleClick={reset}>
            {short ?? label}
          </label>
        </Tooltip>
        <ValueField
          label={`${label} value`}
          value={clamped}
          min={min}
          max={max}
          step={step}
          unit={unit}
          mixed={mixed}
          onCommit={(next) => onChange(next, true)}
        />
        {changed ? (
          <ResetButton label={`Reset ${label}`} onClick={reset} />
        ) : (
          resting !== undefined && <span className="video-editor__slider-slot" aria-hidden="true" />
        )}
        {trailing}
      </div>
      <div
        className={classNames(
          "video-editor__slider-track",
          origin > min && origin < max && "video-editor__slider-track--centred",
        )}
        style={rangeFill(clamped, min, max, origin)}
      >
        <Slider
          id={id}
          origin={origin}
          min={min}
          max={max}
          step={step}
          value={clamped}
          aria-label={short ? label : undefined}
          aria-valuetext={mixed ? "Mixed" : unit.format(clamped)}
          onChange={(event) => {
            movedRef.current = true;
            onChange(Number(event.target.value), false);
          }}
          onPointerUp={settle}
          onKeyUp={settle}
          onBlur={settle}
        />
      </div>
    </div>
  );
}

/** ``value`` moved onto the slider's grid of steps and inside its range. */
function snap(value: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((value - min) / step) * step;
  return Number(Math.min(max, Math.max(min, stepped)).toFixed(10));
}

/** Typed value: Enter or blur applies, clamped to the `step` grid; Escape reverts; arrows step. */
export function ValueField({
  label,
  value,
  min,
  max,
  step,
  unit,
  mixed = false,
  className = "video-editor__slider-value",
  onCommit,
}: {
  /** The field's accessible name. */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: SliderUnit;
  mixed?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}) {
  const shown = mixed ? "" : unit.format(value);
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  if (useChanged(shown)) {
    setText(shown);
    setInvalid(false);
  }

  const apply = (keepInvalid: boolean) => {
    if (text.trim() === shown) return;
    const parsed = unit.parse(text);
    if (parsed === null) {
      if (keepInvalid) setInvalid(true);
      else setText(shown);
      return;
    }
    const next = snap(parsed, min, max, step);
    setInvalid(false);
    setText(unit.format(next));
    onCommit(next);
  };
  return (
    <input
      className={className}
      value={text}
      placeholder={mixed ? "Mixed" : undefined}
      aria-label={label}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      autoComplete="off"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        setText(event.target.value);
        setInvalid(false);
      }}
      onBlur={() => apply(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setText(shown);
          setInvalid(false);
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const delta = step * (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
          const next = snap(value + delta, min, max, step);
          if (next !== value) onCommit(next);
        }
      }}
    />
  );
}
