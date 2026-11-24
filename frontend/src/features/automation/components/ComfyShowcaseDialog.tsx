import { useId, useState } from "react";
import { ComfyPresetSection } from "@/features/automation/components/ComfyPresetSection";
import { ServiceStatus } from "@/features/automation/components/ServiceStatus";
import { ShowcaseItemForm } from "@/features/automation/components/ShowcaseForms";
import { ShowcaseItemList } from "@/features/automation/components/ShowcaseItemList";
import { ShowcaseSetMenu } from "@/features/automation/components/ShowcaseSetMenu";
import { ShowcaseSubjects } from "@/features/automation/components/ShowcaseSubjects";
import { comfyServiceState, useComfyPresetList } from "@/features/automation/hooks/useComfyPresets";
import { useListedPreset } from "@/features/automation/hooks/useListedPreset";
import {
  resolveContent,
  resolveShowcase,
  useShowcaseDraft,
  type ShowcaseDraft,
} from "@/features/automation/hooks/useShowcaseDraft";
import { useShowcaseLoras, useTrainedHere } from "@/features/automation/hooks/useShowcaseLoras";
import { presetTakes } from "@/features/automation/lib/presetTakes";
import {
  sheetLayoutText,
  showcaseTotals,
  showcaseTotalsText,
} from "@/features/automation/lib/showcase";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { MAX_COMFY_GENERATE_PREFIX_LENGTH, MAX_SHOWCASE_ITEMS } from "@/shared/constants";
import { iconPlus, iconTriangleAlert } from "@/shared/icons";
import type { ComfyPresetSummary, ComfyShowcaseJobSettings, GalleryItem } from "@/shared/types";
import { Button } from "@/shared/ui/Button";
import { Checkbox } from "@/shared/ui/Checkbox";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { Field, TextInput } from "@/shared/ui/Field";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { Icon } from "@/shared/ui/Icon";

interface ComfyShowcaseDialogProps {
  scope: DialogScopeInfo;
  initialSettings: JobSettingsByType["comfy_showcase"];
  busy?: boolean;
  folderPath: string;
  /** The open folder's media, offered as start files. */
  folderItems: readonly GalleryItem[];
  onConfirm: (settings: ComfyShowcaseJobSettings) => void;
  onCancel: () => void;
}

/** A showcase preset also says whether its items take a start file. */
function showcaseTakes(entry: ComfyPresetSummary): string {
  const takes = presetTakes(entry);
  return entry.source_kind ? `${takes} · Start ${entry.source_kind}` : takes;
}

/** Presets on the left, the LoRA and the items in the middle, the selected item on the right. */
export function ComfyShowcaseDialog({
  scope,
  initialSettings,
  busy = false,
  folderPath,
  folderItems,
  onConfirm,
  onCancel,
}: ComfyShowcaseDialogProps) {
  const state = useShowcaseDraft(initialSettings);
  const { draft } = state;
  const presets = useComfyPresetList("showcase");
  const loras = useShowcaseLoras();
  const trainedHere = useTrainedHere(folderPath);
  const [problem, setProblem] = useState<{ message: string; draft: ShowcaseDraft } | null>(null);
  const errorId = useId();
  const subjectsId = useId();
  const itemsId = useId();

  const listed = presets.status === "ready" ? presets.presets : undefined;
  const comfyReady = presets.status === "ready" && presets.service === "ready";
  const comfyService = comfyServiceState(presets);
  const { preset: presetName, removed } = useListedPreset(
    listed?.map((entry) => entry.name),
    draft.preset,
  );
  const preset = listed?.find((entry) => entry.name === presetName) ?? null;
  const resolved = resolveContent(draft, preset);
  const totals = showcaseTotals(draft.items, draft.subjects.length);
  // Any edit answers the message, so it goes with the draft it was about.
  const error = problem?.draft === draft ? problem.message : null;

  const handleConfirm = () => {
    if (busy || !listed || !comfyReady) return;
    const start = resolveShowcase(draft, preset);
    if ("error" in start) {
      setProblem({ message: start.error, draft });
      if (start.select !== undefined) state.select(start.select);
      return;
    }
    setProblem(null);
    onConfirm(start.body);
  };

  return (
    <GuardedDialog
      confirmDisabled={busy || !presetName || !comfyReady}
      unsavedChanges={state.changed}
      scope={scope}
      title="Create a LoRA showcase?"
      description={
        <>
          Renders every item with the LoRA showcased, as new files from{" "}
          <strong>{draft.namePrefix.trim() || presetName || "showcase"}_0001</strong> onwards.
          Compare several LoRAs to render each item once per LoRA.
        </>
      }
      panelClassName="comfy-showcase-dialog"
      busy={busy}
      onConfirm={handleConfirm}
      onClose={onCancel}
      describedById={error ? errorId : undefined}
      footer={
        <>
          {comfyService && (
            <ServiceStatus
              service="comfy"
              state={comfyService}
              address={presets.status === "ready" ? presets.baseUrl : undefined}
            />
          )}
          <DialogActions
            confirmLabel="Start showcase"
            busyLabel="Starting..."
            onCancel={onCancel}
          />
        </>
      }
    >
      <div className="comfy-preset-layout comfy-showcase">
        <ComfyPresetSection
          state={presets}
          value={presetName}
          removed={removed}
          disabled={busy}
          emptyHint={
            <p className="field__hint">
              No preset loads a model to add LoRAs to. Export one with a <strong>UNETLoader</strong>
              , or title its model node <strong>DataForge Model</strong>, into{" "}
              <strong>comfy_workflows</strong>.
            </p>
          }
          describe={showcaseTakes}
          onChange={(name) => state.update({ preset: name })}
        />

        <section className="comfy-preset-layout__preview comfy-showcase__middle">
          <div className="comfy-preset-layout__preview-head">
            <h3 id={subjectsId} className="comfy-preset-layout__heading">
              LoRA to showcase
            </h3>
          </div>
          <ShowcaseSubjects
            subjects={draft.subjects}
            loras={loras}
            labelledById={subjectsId}
            disabled={busy}
            onChange={(subjects) => state.update({ subjects })}
          />
          {trainedHere && (
            <p className="comfy-showcase__warning" role="note">
              <Icon icon={iconTriangleAlert} />
              <span>
                <strong>{trainedHere}</strong> trained on this folder, and AI-Toolkit trains on
                every file in it and its subfolders.
              </span>
            </p>
          )}

          <div className="comfy-showcase__items-head">
            <h3 id={itemsId} className="comfy-preset-layout__heading">
              Items
            </h3>
            <span className="comfy-showcase__totals" aria-live="polite">
              {showcaseTotalsText(totals)}
            </span>
            <ShowcaseSetMenu
              content={"content" in resolved ? resolved.content : null}
              disabled={busy}
              onLoad={state.loadSet}
            />
            <Button
              icon={iconPlus}
              size="xs"
              disabled={busy || draft.items.length >= MAX_SHOWCASE_ITEMS}
              onClick={state.addItem}
            >
              Add item
            </Button>
          </div>
          <ShowcaseItemList state={state} labelledById={itemsId} disabled={busy} />

          <div className="comfy-showcase__output">
            <Field label="File name prefix">
              {(control) => (
                <TextInput
                  {...control}
                  value={draft.namePrefix}
                  maxLength={MAX_COMFY_GENERATE_PREFIX_LENGTH}
                  placeholder={presetName || "Preset name"}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(event) => state.update({ namePrefix: event.target.value })}
                />
              )}
            </Field>
            <Checkbox
              label="Make a showcase sheet"
              hint={sheetLayoutText(totals)}
              checked={draft.makeSheet}
              disabled={busy}
              onChange={(makeSheet) => state.update({ makeSheet })}
            />
          </div>
        </section>

        <div className="comfy-preset-layout__form">
          <ShowcaseItemForm
            state={state}
            index={state.selection}
            preset={preset}
            loras={loras.options}
            folderItems={folderItems}
            disabled={busy}
          />
          {error && (
            <p id={errorId} className="dialog__error comfy-preset-layout__error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </GuardedDialog>
  );
}
