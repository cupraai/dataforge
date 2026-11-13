import { Button } from "@/shared/ui/Button";
import { iconChartBar } from "@/shared/icons";
import { Tooltip } from "@/shared/ui/Tooltip";

interface StatsButtonProps {
  open: boolean;
  onToggle: () => void;
}

export function StatsButton({ open, onToggle }: StatsButtonProps) {
  return (
    <Tooltip content="Dataset statistics">
      <Button
        iconOnly
        icon={iconChartBar}
        onClick={onToggle}
        aria-label="Open dataset statistics"
        aria-expanded={open}
        // Points at the drawer from outside it, so the id is a fixed string.
        aria-controls={open ? "stats-dialog-panel" : undefined}
      />
    </Tooltip>
  );
}
