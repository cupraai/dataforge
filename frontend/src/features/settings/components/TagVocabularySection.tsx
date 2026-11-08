import { useId } from "react";
import { iconList } from "@/shared/icons";
import { formatCount } from "@/shared/lib/format";
import type { TagVocabularyResponse } from "@/shared/types";
import { SettingsGroup } from "./SettingsGroup";

interface TagVocabularySectionProps {
  /** The saved file and its counts; null while loading. */
  saved: TagVocabularyResponse | null;
  error: string | null;
  /** The text being edited, which Save writes. */
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
}

function describeSaved({ default_count, added_count }: TagVocabularyResponse): string {
  const builtIn = `${formatCount(default_count)} built-in terms`;
  if (added_count === 0) return `The tagger looks for the ${builtIn} only.`;
  const added = `${formatCount(added_count)} ${added_count === 1 ? "term" : "terms"}`;
  return `As saved, your list adds ${added} to the ${builtIn}.`;
}

export function TagVocabularySection({
  saved,
  error,
  value,
  disabled,
  onChange,
}: TagVocabularySectionProps) {
  const textId = useId();

  return (
    <SettingsGroup
      title="Your terms"
      icon={iconList}
      hint="One term per line; '#' starts a comment. Concrete, visible things work best, such as 'red dress': the detector finds objects, not moods or styles."
      fill
    >
      {error ? (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="dialog__field settings-group__fill-field">
            <label htmlFor={textId} className="dialog__label">
              Terms
            </label>
            <textarea
              id={textId}
              className="dialog__input dialog__input--multiline"
              value={value}
              placeholder={saved ? "red dress\nhot air balloon" : "Loading..."}
              spellCheck={false}
              disabled={disabled || !saved}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
          <p className="settings-dialog__status" role="status">
            {saved ? describeSaved(saved) : "Loading..."}
          </p>
        </>
      )}
    </SettingsGroup>
  );
}
