import { classNames } from "@/shared/lib/classNames";
import type { ProbedService } from "@/shared/types";
import { Tooltip } from "@/shared/ui/Tooltip";

/** `warning`: the server answers, but not with everything the dialog wanted to know. */
export type ServiceState = "checking" | "ready" | "offline" | "warning";

interface ServiceNames {
  /** Starts a label: "Vision server ready". */
  label: string;
  /** Inside a sentence: "Checking the vision server...". */
  inline: string;
  /** Starts a sentence: "The vision server is not answering". */
  sentence: string;
}

const NAMES: Record<ProbedService, ServiceNames> = {
  vision: { label: "Vision server", inline: "the vision server", sentence: "The vision server" },
  comfy: { label: "ComfyUI", inline: "ComfyUI", sentence: "ComfyUI" },
  ai_toolkit: { label: "AI-Toolkit", inline: "AI-Toolkit", sentence: "AI-Toolkit" },
};

const LABELS: Record<ServiceState, (names: ServiceNames) => string> = {
  checking: (names) => `Checking ${names.inline}...`,
  ready: (names) => `${names.label} ready`,
  offline: (names) => `${names.label} offline`,
  warning: (names) => `${names.label} needs attention`,
};

interface ServiceStatusProps {
  service: ProbedService;
  state: ServiceState;
  /** The address that was asked, when the dialog knows it. */
  address?: string;
  /** What is wrong and how to fix it, for the `warning` state. */
  issue?: string | null;
}

function tooltipFor({ service, state, address, issue }: ServiceStatusProps): string | null {
  if (state === "offline") {
    const where = address ? ` at ${address}` : "";
    return `${NAMES[service].sentence} is not answering${where}. Start it or check its address in Settings.`;
  }
  if (state === "warning") return issue ?? null;
  if (state === "ready" && address) return `Answering at ${address}`;
  return null;
}

/**
 * Whether the server a job needs answers, for the left of a job dialog's action bar. The text
 * stays short; what is wrong and how to fix it is in the tooltip.
 */
export function ServiceStatus(props: ServiceStatusProps) {
  const tooltip = tooltipFor(props);
  return (
    <Tooltip content={tooltip} placement="top" disabled={!tooltip}>
      <span
        className={classNames("service-status", `service-status--${props.state}`)}
        role="status"
        // Focusable only with something to read, so a keyboard reaches the tooltip.
        /* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
           -- the tooltip holds the fix, and focus is how a keyboard opens it */
        tabIndex={tooltip ? 0 : undefined}
      >
        <span className="service-status__dot" aria-hidden="true" />
        {LABELS[props.state](NAMES[props.service])}
      </span>
    </Tooltip>
  );
}
