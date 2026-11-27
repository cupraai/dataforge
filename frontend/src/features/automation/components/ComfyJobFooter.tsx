import { ServiceStatus, type ServiceState } from "@/features/automation/components/ServiceStatus";
import type { PresetsState } from "@/features/automation/hooks/useComfyPresets";
import { DialogActions } from "@/shared/ui/Dialog";

interface ComfyJobFooterProps {
  presets: PresetsState;
  confirmLabel: string;
  onCancel: () => void;
}

/** Null when the presets could not be listed, which the dialog body reports instead. */
function comfyServiceState(presets: PresetsState): ServiceState | null {
  if (presets.status === "loading") return "checking";
  return presets.status === "ready" ? presets.service : null;
}

/** A ComfyUI job dialog's footer: ComfyUI's status beside the start and cancel buttons. */
export function ComfyJobFooter({ presets, confirmLabel, onCancel }: ComfyJobFooterProps) {
  const service = comfyServiceState(presets);
  return (
    <>
      {service && (
        <ServiceStatus
          service="comfy"
          state={service}
          address={presets.status === "ready" ? presets.baseUrl : undefined}
        />
      )}
      <DialogActions confirmLabel={confirmLabel} busyLabel="Starting..." onCancel={onCancel} />
    </>
  );
}
