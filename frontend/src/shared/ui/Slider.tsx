import type { InputHTMLAttributes, Ref } from "react";
import { classNames } from "@/shared/lib/classNames";
import { rangeFill } from "@/shared/lib/rangeFill";

interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "value" | "min" | "max"
> {
  value: number;
  min: number;
  max: number;
  /** Where the fill starts; a centred control such as Rotation fills outwards from its middle. */
  origin?: number;
  /** md in inspectors and capture bars; sm in compact tool rows. */
  size?: "md" | "sm";
  ref?: Ref<HTMLInputElement>;
}

/** A range input whose track is painted from `origin` to the value. */
export function Slider({
  value,
  min,
  max,
  origin,
  size = "md",
  className,
  style,
  ...props
}: SliderProps) {
  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      className={classNames("slider", `slider--${size}`, className)}
      style={{ ...rangeFill(value, min, max, origin), ...style }}
    />
  );
}
