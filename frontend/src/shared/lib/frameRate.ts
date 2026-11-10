import { VIDEO_FRAME_RATES } from "@/shared/constants";
import type { VideoFrameRate } from "@/shared/types";

/** A native select holds strings; `keep` stands for no conversion. */
export type FrameRateChoice = "keep" | `${VideoFrameRate}`;

export function frameRateOptions(keepTitle: string): { value: FrameRateChoice; title: string }[] {
  return [
    { value: "keep", title: keepTitle },
    ...VIDEO_FRAME_RATES.map((rate) => ({
      value: `${rate}` as const,
      title: `${rate} fps`,
    })),
  ];
}

export function frameRateChoice(rate: VideoFrameRate | null | undefined): FrameRateChoice {
  return rate == null ? "keep" : `${rate}`;
}

export function frameRateFromChoice(choice: FrameRateChoice): VideoFrameRate | null {
  return choice === "keep" ? null : (Number(choice) as VideoFrameRate);
}
