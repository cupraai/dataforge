import { FieldGroup } from "@/shared/ui/Field";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useState } from "react";
import { DialogActions } from "@/shared/ui/Dialog";
import { ATTRIBUTE_LABELS, type AttributeGroup } from "@/features/videoEditor/lib/clipboard";

interface PasteAttributesDialogProps {
  /** Names the copied clip the settings come from. */
  donorLabel: string;
  targetCount: number;
  groups: AttributeGroup[];
  onPaste: (groups: AttributeGroup[]) => void;
  onCancel: () => void;
}

/** Chooses which of the copied clip's settings the selected clips take. */
export function PasteAttributesDialog({
  donorLabel,
  targetCount,
  groups,
  onPaste,
  onCancel,
}: PasteAttributesDialogProps) {
  const [chosen, setChosen] = useState<Set<AttributeGroup>>(() => new Set(groups));
  const submit = () => {
    if (chosen.size > 0) onPaste(groups.filter((group) => chosen.has(group)));
  };
  return (
    <GuardedDialog
      confirmDisabled={chosen.size === 0}
      unsavedChanges={chosen.size !== groups.length}
      title="Paste attributes"
      description={
        <>
          Gives {targetCount === 1 ? "the selected clip" : `the ${targetCount} selected clips`} the
          settings of <strong>{donorLabel}</strong>. A clip keeps any setting it cannot take.
        </>
      }
      role="dialog"
      onConfirm={submit}
      onClose={onCancel}
      footer={<DialogActions confirmLabel="Paste" onCancel={onCancel} />}
    >
      <FieldGroup label="Settings" className="video-editor__attribute-list">
        {groups.map((group) => (
          <Checkbox
            key={group}
            label={ATTRIBUTE_LABELS[group]}
            checked={chosen.has(group)}
            onChange={(checked) =>
              setChosen((current) => {
                const next = new Set(current);
                if (checked) next.add(group);
                else next.delete(group);
                return next;
              })
            }
          />
        ))}
      </FieldGroup>
    </GuardedDialog>
  );
}
