import { useAutomationSpecsVisible } from "@/features/automation/hooks/useAutomationSpecsVisible";
import { iconCpu } from "@/shared/icons";
import { Button } from "@/shared/ui/Button";
import { Tooltip } from "@/shared/ui/Tooltip";

/** Shows or hides the system specifications strip under the toolbar. */
export function SystemSpecsButton() {
  const { showSpecs, toggleSpecs } = useAutomationSpecsVisible();
  return (
    <Tooltip content={showSpecs ? "Hide system specifications" : "Show system specifications"}>
      <Button
        iconOnly
        icon={iconCpu}
        aria-label="Toggle system specifications"
        aria-expanded={showSpecs}
        // Points at the strip from the toolbar, so the id is a fixed string.
        aria-controls={showSpecs ? "workspace-system-specs" : undefined}
        onClick={toggleSpecs}
      />
    </Tooltip>
  );
}
