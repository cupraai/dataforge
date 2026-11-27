import { ServiceStatus } from "@/features/automation/components/ServiceStatus";
import type { VisionLlmState } from "@/features/automation/hooks/useVisionLlmInfo";
import { DialogActions } from "@/shared/ui/Dialog";

interface VisionJobFooterProps {
  vision: VisionLlmState;
  confirmLabel: string;
  onCancel: () => void;
}

/** A vision-LLM job dialog's footer: the server's status beside the start and cancel buttons. */
export function VisionJobFooter({ vision, confirmLabel, onCancel }: VisionJobFooterProps) {
  return (
    <>
      <ServiceStatus
        service="vision"
        state={vision.service}
        address={vision.info?.baseUrl}
        issue={vision.issue}
      />
      <DialogActions confirmLabel={confirmLabel} busyLabel="Starting..." onCancel={onCancel} />
    </>
  );
}
