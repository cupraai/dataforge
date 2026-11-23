import type { ShowcaseLoras } from "@/features/automation/hooks/useShowcaseLoras";
import { describeLora, loraLabel } from "@/features/automation/lib/showcase";
import { MAX_SHOWCASE_SUBJECT_LORAS } from "@/shared/constants";
import { iconPlus, iconRefresh, iconX } from "@/shared/icons";
import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import { SearchSelect } from "@/shared/ui/SearchSelect";

interface ShowcaseSubjectsProps {
  /** The LoRAs showcased; several compare them. */
  subjects: readonly string[];
  loras: ShowcaseLoras;
  labelledById: string;
  disabled: boolean;
  onChange: (subjects: string[]) => void;
}

/** The LoRA to showcase as chips, with the picker that adds more to compare. */
export function ShowcaseSubjects({
  subjects,
  loras,
  labelledById,
  disabled,
  onChange,
}: ShowcaseSubjectsProps) {
  const full = subjects.length >= MAX_SHOWCASE_SUBJECT_LORAS;
  const comparing = subjects.length > 0;
  return (
    <>
      <div className="comfy-showcase__subjects" role="group" aria-labelledby={labelledById}>
        {subjects.map((name) => (
          <span key={name} className="comfy-showcase__chip" title={name}>
            <span className="comfy-showcase__chip-label">{loraLabel(name, subjects)}</span>
            <IconButton
              icon={iconX}
              label={`Remove ${describeLora(name).stem}`}
              size="2xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(subjects.filter((entry) => entry !== name))}
            />
          </span>
        ))}
        <SearchSelect
          label="LoRAs"
          options={loras.options}
          selected={subjects}
          onPick={(name) => {
            if (!subjects.includes(name)) onChange([...subjects, name]);
          }}
          triggerLabel={comparing ? "Compare" : "Choose LoRA"}
          triggerAriaLabel={comparing ? "Add a LoRA to compare" : "Choose the LoRA to showcase"}
          triggerIcon={iconPlus}
          loading={loras.loading}
          emptyText={loras.note ?? "ComfyUI lists no LoRA by that name."}
          disabled={disabled || full}
          footer={(close) => (
            <>
              <Button icon={iconRefresh} size="xs" variant="text" onClick={loras.refresh}>
                Refresh
              </Button>
              {loras.runs.map((run) => (
                <Button
                  key={run.name}
                  size="xs"
                  variant="text"
                  title={`Compare every save of ${run.name} ComfyUI lists`}
                  onClick={() => {
                    onChange(run.saves.slice(-MAX_SHOWCASE_SUBJECT_LORAS));
                    close();
                  }}
                >
                  Every save of {run.name}
                </Button>
              ))}
            </>
          )}
        />
      </div>
      {!comparing && (
        <p className="field__hint comfy-showcase__note">
          {loras.note ??
            "Copy the trained LoRA into ComfyUI's models/loras folder, then choose it here. Choose several to compare them."}
        </p>
      )}
    </>
  );
}
