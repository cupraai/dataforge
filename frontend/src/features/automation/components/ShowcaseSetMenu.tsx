import { showcaseSetsStore } from "@/features/automation/api/showcase";
import { SavedMenu } from "@/features/automation/components/SavedMenu";
import type { ShowcaseContent } from "@/features/automation/hooks/useShowcaseDraft";
import { plural } from "@/features/automation/lib/showcase";
import { MAX_SHOWCASE_SET_NAME_LENGTH } from "@/shared/constants";
import type { ComfyShowcaseSet } from "@/shared/types";

interface ShowcaseSetMenuProps {
  /** What saving stores; null while a field does not parse, which disables saving. */
  content: ShowcaseContent | null;
  disabled?: boolean;
  onLoad: (showcase: ComfyShowcaseSet) => void;
}

/** Saved items and inputs, kept apart from the LoRA so the next LoRA reuses them. */
export function ShowcaseSetMenu({ content, disabled, onLoad }: ShowcaseSetMenuProps) {
  return (
    <SavedMenu
      store={showcaseSetsStore}
      triggerLabel="Sets"
      title="Showcase sets"
      caption="Loading a set replaces the items; the LoRAs and output stay."
      empty="Save these items to showcase the next LoRA with the same prompts."
      preview={(showcase) => `${showcase.preset} · ${plural(showcase.items.length, "item")}`}
      saveLabel="Save these items..."
      nameLabel="Name for the set"
      maxNameLength={MAX_SHOWCASE_SET_NAME_LENGTH}
      toEntry={content && ((name) => ({ ...content, name }))}
      blockedReason="Choose a preset and fix the items first"
      placement="top-start"
      disabled={disabled}
      onPick={onLoad}
    />
  );
}
