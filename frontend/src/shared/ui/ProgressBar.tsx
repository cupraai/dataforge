import { classNames } from "@/shared/lib/classNames";

interface ProgressBarProps {
  /** Percent done, 0 to 100. */
  value: number;
  /** Names the progressbar; without one the bar is decoration beside a readout that says it. */
  label?: string;
  /** How the work ended or is going, when it is not plain progress. */
  tone?: "error" | "warning" | "cancelled" | null;
  className?: string;
}

/** A thin pill track filled to `value`; spans, so it can sit inside inline status text. */
export function ProgressBar({ value, label, tone, className }: ProgressBarProps) {
  const percent = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <span
      className={classNames("progress", className)}
      {...(label
        ? {
            role: "progressbar",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": percent,
          }
        : { "aria-hidden": true })}
    >
      <span
        className={classNames("progress__fill", tone && `progress__fill--${tone}`)}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
