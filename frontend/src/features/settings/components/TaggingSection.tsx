import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatApiError } from "@/shared/api/http";
import { iconRefresh, iconTag } from "@/shared/icons";
import { formatCount } from "@/shared/lib/format";
import { useNotify } from "@/shared/notifications/notifications";
import type { TaggingState } from "@/shared/types";
import {
  retagEverything,
  TAGGING_STATUS_QUERY_KEY,
  taggingStatusQueryOptions,
} from "@/features/tagging/api/tagging";
import { SettingsActionButton } from "./SettingsActionButton";
import { SettingsCheckbox } from "./SettingsCheckbox";
import { SettingsGroup } from "./SettingsGroup";

/** Often enough to watch a folder being worked through, while the section is open. */
const STATUS_REFRESH_MS = 3000;

const STATE_LABELS: Record<TaggingState, string> = {
  disabled: "Off",
  unavailable: "Not installed",
  idle: "Up to date",
  loading: "Loading the model",
  tagging: "Tagging",
  failed: "Stopped",
};

/** The tagger cannot take work in these, so a re-tag would only wait. */
const IDLE_STATES: readonly TaggingState[] = ["disabled", "unavailable"];

interface TaggingSectionProps {
  visible: boolean;
  /** The draft value; the status below follows the saved one until Save. */
  enabled: boolean;
  disabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: ReactNode;
}

export function TaggingSection({
  visible,
  enabled,
  disabled,
  onEnabledChange,
  children,
}: TaggingSectionProps) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const statusQuery = useQuery({
    ...taggingStatusQueryOptions(),
    enabled: visible && enabled,
    refetchInterval: visible && enabled ? STATUS_REFRESH_MS : false,
  });
  const retag = useMutation({
    mutationFn: retagEverything,
    onSuccess: ({ queued }) => {
      void queryClient.invalidateQueries({ queryKey: TAGGING_STATUS_QUERY_KEY });
      notify({
        variant: "success",
        message:
          queued === 0
            ? "Nothing is tagged yet, so there is nothing to tag again."
            : `${formatCount(queued)} ${queued === 1 ? "file goes" : "files go"} back to the tagger. Their tags stay until new ones replace them.`,
      });
    },
    onError: (error) => notify({ variant: "danger", message: formatApiError(error) }),
  });

  const status = statusQuery.data ?? null;
  const checking = status ? null : "Checking...";

  return (
    <SettingsGroup
      title="Background tagging"
      icon={iconTag}
      hint={
        enabled
          ? "Tags below the minimum confidence are hidden from cards and search. Lower it to find more, at the cost of more wrong guesses."
          : undefined
      }
      action={
        enabled && (
          <SettingsActionButton
            label="Re-tag everything"
            icon={iconRefresh}
            busy={retag.isPending}
            disabled={disabled || !status || IDLE_STATES.includes(status.state)}
            onClick={() => retag.mutate()}
          />
        )
      }
    >
      <SettingsCheckbox
        label="Tag favorite folders"
        hint="The first run downloads the model, about 500 MB. Turned off, tags are hidden everywhere and kept for later."
        checked={enabled}
        disabled={disabled}
        onChange={onEnabledChange}
      />
      {enabled && (
        <>
          {statusQuery.isError ? (
            <p className="dialog__error" role="alert">
              {formatApiError(statusQuery.error)}
            </p>
          ) : status?.state === "disabled" ? (
            <p className="settings-dialog__status">Tagging starts once you save.</p>
          ) : (
            <>
              <dl className="settings-stats" role="status">
                <div className="settings-stats__tile">
                  <dt>Status</dt>
                  <dd>{status ? STATE_LABELS[status.state] : checking}</dd>
                </div>
                <div className="settings-stats__tile">
                  <dt>Waiting</dt>
                  <dd>{status ? formatCount(status.pending) : checking}</dd>
                </div>
                <div className="settings-stats__tile">
                  <dt>Vocabulary</dt>
                  <dd>{status ? `${formatCount(status.vocabulary_size)} terms` : checking}</dd>
                </div>
              </dl>
              {status?.detail && (
                <p
                  className={
                    status.state === "failed" ? "dialog__error" : "settings-dialog__status"
                  }
                  role={status.state === "failed" ? "alert" : undefined}
                >
                  {status.detail}
                </p>
              )}
            </>
          )}
          {children}
        </>
      )}
    </SettingsGroup>
  );
}
