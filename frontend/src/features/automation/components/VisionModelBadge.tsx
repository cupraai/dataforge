import { visionModelLabel, type VisionLlmInfo } from "@/features/automation/api/visionLlm";
import { iconBrain } from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";

interface VisionModelBadgeProps {
  info: VisionLlmInfo | null;
  /** Waiting for the server: a placeholder keeps the sentence's shape. */
  loading?: boolean;
}

/** The model the server serves, else the configured id; plain words when neither is known. */
export function VisionModelBadge({ info, loading = false }: VisionModelBadgeProps) {
  if (loading) {
    return (
      <span
        className="dialog__model-badge-loading skeleton-shimmer"
        role="img"
        aria-label="the model, still loading"
      />
    );
  }
  const label = info ? visionModelLabel(info) : "";
  if (!label) return <>the vision model</>;
  return (
    <span className="dialog__model-badge">
      <Icon icon={iconBrain} />
      {label}
    </span>
  );
}
