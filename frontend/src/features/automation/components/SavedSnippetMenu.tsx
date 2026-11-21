import { IconButton } from "@/shared/ui/IconButton";
import { Button } from "@/shared/ui/Button";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSnippet,
  saveSnippet,
  savedSnippetsQueryKey,
  savedSnippetsQueryOptions,
} from "@/features/automation/api/savedSnippets";
import { formatApiError } from "@/shared/api/http";
import { MAX_SAVED_SNIPPET_NAME_LENGTH } from "@/shared/constants";
import { useChanged } from "@/shared/hooks/useChanged";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconBookmark, iconBookmarkPlus, iconChevronDown, iconTrash2 } from "@/shared/icons";
import type { SavedSnippetsResponse, SnippetBook } from "@/shared/types";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { TextInput } from "@/shared/ui/Field";
import { Icon } from "@/shared/ui/Icon";
import { DURATION_INSTANT_MS } from "@/shared/lib/motion";

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

export function SavedSnippetMenu({
  book,
  text,
  disabled = false,
  onInsert,
}: SavedSnippetMenuProps) {
  const copy = COPY[book];
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  const queryClient = useQueryClient();
  const snippets = useQuery({ ...savedSnippetsQueryOptions(book), enabled: open });
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const store = (response: SavedSnippetsResponse) =>
    queryClient.setQueryData(savedSnippetsQueryKey(book), response);
  const save = useMutation({
    mutationFn: (snippet: { name: string; text: string }) => saveSnippet(book, snippet),
    onSuccess: store,
  });
  const remove = useMutation({
    mutationFn: (snippetName: string) => deleteSnippet(book, snippetName),
    onSuccess: store,
  });
  const failure = save.error ?? remove.error;

  const trimmedText = text.trim();
  const trimmedName = name.trim();
  const saved = snippets.data?.snippets ?? [];
  const replaces = saved.some(
    (snippet) => snippet.name.toLowerCase() === trimmedName.toLowerCase(),
  );
  const canSave = Boolean(trimmedText && trimmedName) && !save.isPending;

  // Every opening starts at the list; a half-typed name is not kept between openings.
  if (useChanged(open) && !open) {
    setNaming(false);
    setName("");
  }

  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  const stopNaming = () => {
    setNaming(false);
    setName("");
  };

  const handleSave = () => {
    if (!canSave) return;
    remove.reset();
    save.mutate({ name: trimmedName, text: trimmedText }, { onSuccess: stopNaming });
  };

  // The dialog closes on Escape; while the menu is open the key is the menu's.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (naming) stopNaming();
    else close();
  };

  let list;
  if (snippets.isPending) {
    list = <p className="saved-snippets__note">Loading...</p>;
  } else if (snippets.isError) {
    list = (
      <p className="saved-snippets__note" role="alert">
        {formatApiError(snippets.error)}
      </p>
    );
  } else if (saved.length === 0) {
    list = <p className="saved-snippets__empty">{copy.empty}</p>;
  } else {
    list = (
      <ul className="saved-snippets__list" aria-label={copy.title}>
        {saved.map((snippet) => (
          <li key={snippet.name} className="saved-snippets__row">
            <button
              type="button"
              className="saved-snippets__option"
              title={snippet.text}
              onClick={() => {
                onInsert(snippet.text);
                close();
              }}
            >
              <Icon icon={iconBookmark} className="saved-snippets__icon" />
              <span className="saved-snippets__text">
                <span className="saved-snippets__name">{snippet.name}</span>
                <span className="saved-snippets__preview">{snippet.text}</span>
              </span>
            </button>
            <IconButton
              icon={iconTrash2}
              label={`Delete "${snippet.name}"`}
              disabled={remove.isPending}
              onClick={() => {
                save.reset();
                remove.mutate(snippet.name);
              }}
              size="xs"
              variant="ghost"
              tone="danger"
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    /* oxlint-disable-next-line
       jsx-a11y/no-static-element-interactions
       -- catches Escape from the trigger and panel */
    <div ref={rootRef} className="saved-snippets" onKeyDown={handleKeyDown}>
      <Button
        icon={iconBookmark}
        iconEnd={iconChevronDown}
        disabled={disabled}
        {...triggerProps}
        aria-haspopup="dialog"
        size="xs"
      >
        Saved
      </Button>

      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        exitDuration={DURATION_INSTANT_MS}
        id={menuId}
        className="saved-snippets__panel"
        placement="bottom-end"
        role="dialog"
        label={copy.title}
      >
        <p className="saved-snippets__caption">
          Adds the {copy.noun} after the text already typed.
        </p>
        {list}

        <div className="saved-snippets__divider" role="separator" />

        {naming ? (
          <div className="saved-snippets__save">
            <TextInput
              ref={nameRef}
              size="sm"
              className="saved-snippets__input"
              aria-label={`Name for the ${copy.noun}`}
              placeholder="Name"
              value={name}
              maxLength={MAX_SAVED_SNIPPET_NAME_LENGTH}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                handleSave();
              }}
            />
            <Button disabled={!canSave} onClick={handleSave} variant="primary" size="xs">
              {replaces ? "Replace" : "Save"}
            </Button>
            <Button onClick={stopNaming} size="xs">
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="saved-snippets__option"
            disabled={!trimmedText}
            title={trimmedText ? undefined : `Type ${copy.article} ${copy.noun} first`}
            onClick={() => {
              save.reset();
              setNaming(true);
            }}
          >
            <Icon icon={iconBookmarkPlus} className="saved-snippets__icon" />
            Save current {copy.noun}...
          </button>
        )}

        {failure && (
          <p className="saved-snippets__error" role="alert">
            {formatApiError(failure)}
          </p>
        )}
      </AnchoredLayer>
    </div>
  );
}
