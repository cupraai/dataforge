import { savedSnippetsStore } from "@/features/automation/api/savedSnippets";
import { SavedMenu } from "@/features/automation/components/SavedMenu";
import { MAX_SAVED_SNIPPET_NAME_LENGTH } from "@/shared/constants";
import type { SnippetBook } from "@/shared/types";

interface BookCopy {
  /** Lowercase, as it reads mid-sentence. */
  noun: string;
  article: string;
  title: string;
  empty: string;
}

const COPY: Record<SnippetBook, BookCopy> = {
  instructions: {
    noun: "instruction",
    article: "an",
    title: "Saved instructions",
    empty: "Save an instruction to reuse it here, in any folder.",
  },
  verify_instructions: {
    noun: "instruction",
    article: "an",
    title: "Saved instructions",
    empty: "Save an instruction to reuse it when verifying captions, in any folder.",
  },
  comfy_prompts: {
    noun: "prompt",
    article: "a",
    title: "Saved prompts",
    empty: "Save a prompt to reuse it when generating or editing with ComfyUI, in any folder.",
  },
};

interface SavedSnippetMenuProps {
  book: SnippetBook;
  /** The text as typed; saving stores it trimmed. */
  text: string;
  disabled?: boolean;
  onInsert: (text: string) => void;
}

export function SavedSnippetMenu({ book, text, disabled, onInsert }: SavedSnippetMenuProps) {
  const { noun, article, title, empty } = COPY[book];
  const trimmed = text.trim();
  return (
    <SavedMenu
      store={savedSnippetsStore(book)}
      triggerLabel="Saved"
      title={title}
      caption={`Adds the ${noun} after the text already typed.`}
      empty={empty}
      preview={(snippet) => snippet.text}
      entryTitle={(snippet) => snippet.text}
      saveLabel={`Save current ${noun}...`}
      nameLabel={`Name for the ${noun}`}
      maxNameLength={MAX_SAVED_SNIPPET_NAME_LENGTH}
      toEntry={trimmed ? (name) => ({ name, text: trimmed }) : null}
      blockedReason={`Type ${article} ${noun} first`}
      placement="bottom-end"
      disabled={disabled}
      onPick={(snippet) => onInsert(snippet.text)}
    />
  );
}
