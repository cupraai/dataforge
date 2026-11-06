import {
  iconBrain,
  iconCaseSensitive,
  iconEye,
  iconLayers,
  iconModel,
  iconQuote,
  iconScaling,
  iconScanSquare,
  iconVae,
  type AppIcon,
} from "@/shared/icons";
import type { ModelKind } from "@/shared/types";

/** The workflow map's hues, so a file looks like the box it would load into there. */
export type ModelTone = "accent" | "model" | "loras" | "clip" | "vae" | "input" | "prompt";

export interface ModelKindStyle {
  label: string;
  tone: ModelTone;
  icon: AppIcon;
}

// The map has no box for ControlNets, upscalers or embeddings. Each takes the hue of what it
// works on: a ControlNet and an upscaler the image, an embedding the prompt.
const KIND_STYLES: Record<ModelKind, ModelKindStyle> = {
  checkpoint: { label: "Checkpoint", tone: "model", icon: iconBrain },
  diffusion: { label: "Diffusion model", tone: "model", icon: iconBrain },
  lora: { label: "LoRA", tone: "loras", icon: iconLayers },
  lokr: { label: "LoKr", tone: "loras", icon: iconLayers },
  loha: { label: "LoHa", tone: "loras", icon: iconLayers },
  controlnet: { label: "ControlNet", tone: "input", icon: iconScanSquare },
  embedding: { label: "Embedding", tone: "prompt", icon: iconQuote },
  text_encoder: { label: "Text encoder", tone: "clip", icon: iconCaseSensitive },
  vision_encoder: { label: "Vision encoder", tone: "clip", icon: iconEye },
  vae: { label: "VAE", tone: "vae", icon: iconVae },
  upscaler: { label: "Upscaler", tone: "input", icon: iconScaling },
};

const UNKNOWN_STYLE: ModelKindStyle = { label: "Weights", tone: "accent", icon: iconModel };

/** What a model file is drawn as; a header that cannot be read or placed is plain "Weights". */
export function modelKindStyle(kind: ModelKind | null | undefined): ModelKindStyle {
  return kind ? KIND_STYLES[kind] : UNKNOWN_STYLE;
}
