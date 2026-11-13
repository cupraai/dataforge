import { CAPTION_BACKUP_DIR_NAME } from "@/shared/constants";
import { Checkbox } from "@/shared/ui/Checkbox";

interface CaptionBackupOptionProps {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

export function CaptionBackupOption({ checked, disabled, onChange }: CaptionBackupOptionProps) {
  return (
    <Checkbox
      label="Back up captions first"
      hint={
        <>
          Before each edit, originals go to <strong>{CAPTION_BACKUP_DIR_NAME}</strong> for Restore
          captions. Existing backups are overwritten.
        </>
      }
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
