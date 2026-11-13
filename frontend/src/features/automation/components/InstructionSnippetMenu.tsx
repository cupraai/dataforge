import { IconButton } from "@/shared/ui/IconButton";
import { Button } from "@/shared/ui/Button";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteInstructionSnippet,
  INSTRUCTION_SNIPPETS_QUERY_KEY,
  instructionSnippetsQueryOptions,
  saveInstructionSnippet,
} from "@/features/automation/api/instructionSnippets";
import { formatApiError } from "@/shared/api/http";
import { MAX_INSTRUCTION_SNIPPET_NAME_LENGTH } from "@/shared/constants";
import { useChanged } from "@/shared/hooks/useChanged";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconBookmark, iconBookmarkPlus, iconChevronDown, iconTrash2 } from "@/shared/icons";
import type { InstructionSnippetsResponse } from "@/shared/types";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { TextInput } from "@/shared/ui/Field";
import { Icon } from "@/shared/ui/Icon";

interface InstructionSnippetMenuProps {
  /** The instruction as typed; saving stores it trimmed. */
  instruction: string;
  disabled?: boolean;
  onInsert: (text: string) => void;
}

export function InstructionSnippetMenu({
  instruction,
  disabled = false,
  onInsert,
}: InstructionSnippetMenuProps) {
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  const queryClient = useQueryClient();
  const snippets = useQuery({ ...instructionSnippetsQueryOptions(), enabled: open });
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const store = (response: InstructionSnippetsResponse) =>
    queryClient.setQueryData(INSTRUCTION_SNIPPETS_QUERY_KEY, response);
  const save = useMutation({ mutationFn: saveInstructionSnippet, onSuccess: store });
  const remove = useMutation({ mutationFn: deleteInstructionSnippet, onSuccess: store });
  const failure = save.error ?? remove.error;

  const text = instruction.trim();
  const trimmedName = name.trim();
  const saved = snippets.data?.snippets ?? [];
  const replaces = saved.some(
    (snippet) => snippet.name.toLowerCase() === trimmedName.toLowerCase(),
  );
  const canSave = Boolean(text && trimmedName) && !save.isPending;

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
    save.mutate({ name: trimmedName, text }, { onSuccess: stopNaming });
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
    list = <p className="instruction-snippets__note">Loading...</p>;
  } else if (snippets.isError) {
    list = (
      <p className="instruction-snippets__note" role="alert">
        {formatApiError(snippets.error)}
      </p>
    );
  } else if (saved.length === 0) {
    list = (
      <p className="instruction-snippets__empty">
        Save an instruction to reuse it here, in any folder.
      </p>
    );
  } else {
    list = (
      <ul className="instruction-snippets__list" aria-label="Saved instructions">
        {saved.map((snippet) => (
          <li key={snippet.name} className="instruction-snippets__row">
            <button
              type="button"
              className="instruction-snippets__option"
              title={snippet.text}
              onClick={() => {
                onInsert(snippet.text);
                close();
              }}
            >
              <Icon icon={iconBookmark} className="instruction-snippets__icon" />
              <span className="instruction-snippets__text">
                <span className="instruction-snippets__name">{snippet.name}</span>
                <span className="instruction-snippets__preview">{snippet.text}</span>
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
    <div ref={rootRef} className="instruction-snippets" onKeyDown={handleKeyDown}>
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
        id={menuId}
        className="instruction-snippets__panel"
        placement="bottom-end"
        role="dialog"
        label="Saved instructions"
      >
        <p className="instruction-snippets__caption">
          Adds the instruction after the text already typed.
        </p>
        {list}

        <div className="instruction-snippets__divider" role="separator" />

        {naming ? (
          <div className="instruction-snippets__save">
            <TextInput
              ref={nameRef}
              size="sm"
              className="instruction-snippets__input"
              aria-label="Name for the instruction"
              placeholder="Name"
              value={name}
              maxLength={MAX_INSTRUCTION_SNIPPET_NAME_LENGTH}
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
            className="instruction-snippets__option"
            disabled={!text}
            title={text ? undefined : "Type an instruction first"}
            onClick={() => {
              save.reset();
              setNaming(true);
            }}
          >
            <Icon icon={iconBookmarkPlus} className="instruction-snippets__icon" />
            Save current instruction...
          </button>
        )}

        {failure && (
          <p className="instruction-snippets__error" role="alert">
            {formatApiError(failure)}
          </p>
        )}
      </AnchoredLayer>
    </div>
  );
}
