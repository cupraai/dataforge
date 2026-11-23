import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatApiError } from "@/shared/api/http";
import { useChanged } from "@/shared/hooks/useChanged";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { iconBookmark, iconBookmarkPlus, iconChevronDown, iconTrash2 } from "@/shared/icons";
import { DURATION_INSTANT_MS } from "@/shared/lib/motion";
import { AnchoredLayer } from "@/shared/ui/AnchoredLayer";
import { Button } from "@/shared/ui/Button";
import { TextInput } from "@/shared/ui/Field";
import { Icon } from "@/shared/ui/Icon";
import { IconButton } from "@/shared/ui/IconButton";

/** A named list kept on the server; saving a name that matches ignoring case replaces it. */
export interface SavedStore<Response, Entry extends { name: string }> {
  queryKey: readonly unknown[];
  load: (signal: AbortSignal) => Promise<Response>;
  entries: (response: Response) => readonly Entry[];
  save: (entry: Entry) => Promise<Response>;
  remove: (name: string) => Promise<Response>;
}

interface SavedMenuProps<Response, Entry extends { name: string }> {
  store: SavedStore<Response, Entry>;
  /** The trigger's text. */
  triggerLabel: string;
  /** Names the panel and its list. */
  title: string;
  /** What picking an entry does. */
  caption: string;
  /** Shown while nothing is saved. */
  empty: string;
  /** One line under an entry's name. */
  preview: (entry: Entry) => string;
  /** An entry's hover text. */
  entryTitle?: (entry: Entry) => string;
  saveLabel: string;
  /** The name field's accessible name. */
  nameLabel: string;
  maxNameLength: number;
  /** What saving stores under a name, or null while there is nothing to save. */
  toEntry: ((name: string) => Entry) | null;
  /** Why there is nothing to save. */
  blockedReason: string;
  placement: "top-start" | "bottom-end";
  disabled?: boolean;
  onPick: (entry: Entry) => void;
}

/** A button over a named list: pick an entry, delete one, or save what is being edited. */
export function SavedMenu<Response, Entry extends { name: string }>({
  store,
  triggerLabel,
  title,
  caption,
  empty,
  preview,
  entryTitle,
  saveLabel,
  nameLabel,
  maxNameLength,
  toEntry,
  blockedReason,
  placement,
  disabled = false,
  onPick,
}: SavedMenuProps<Response, Entry>) {
  const { open, close, menuId, rootRef, panelRef, triggerProps } = usePopupMenu();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: store.queryKey,
    queryFn: ({ signal }) => store.load(signal),
    enabled: open,
  });
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const keep = (response: Response) => queryClient.setQueryData(store.queryKey, response);
  const save = useMutation({ mutationFn: store.save, onSuccess: keep });
  const remove = useMutation({ mutationFn: store.remove, onSuccess: keep });
  const failure = save.error ?? remove.error;

  const saved = query.data === undefined ? [] : store.entries(query.data);
  const trimmedName = name.trim();
  const replaces = saved.some((entry) => entry.name.toLowerCase() === trimmedName.toLowerCase());
  const canSave = toEntry !== null && Boolean(trimmedName) && !save.isPending;

  const stopNaming = () => {
    setNaming(false);
    setName("");
  };

  // Every opening starts at the list; a half-typed name is not kept between openings.
  if (useChanged(open) && !open) stopNaming();

  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  const handleSave = () => {
    if (!canSave) return;
    remove.reset();
    save.mutate(toEntry(trimmedName), { onSuccess: stopNaming });
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
  if (query.isPending) {
    list = <p className="saved-menu__note">Loading...</p>;
  } else if (query.isError) {
    list = (
      <p className="saved-menu__note" role="alert">
        {formatApiError(query.error)}
      </p>
    );
  } else if (saved.length === 0) {
    list = <p className="saved-menu__empty">{empty}</p>;
  } else {
    list = (
      <ul className="saved-menu__list" aria-label={title}>
        {saved.map((entry) => (
          <li key={entry.name} className="saved-menu__row">
            <button
              type="button"
              className="saved-menu__option"
              title={entryTitle?.(entry)}
              onClick={() => {
                onPick(entry);
                close();
              }}
            >
              <Icon icon={iconBookmark} className="saved-menu__icon" />
              <span className="saved-menu__text">
                <span className="saved-menu__name">{entry.name}</span>
                <span className="saved-menu__preview">{preview(entry)}</span>
              </span>
            </button>
            <IconButton
              icon={iconTrash2}
              label={`Delete "${entry.name}"`}
              disabled={remove.isPending}
              onClick={() => {
                save.reset();
                remove.mutate(entry.name);
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
    <div ref={rootRef} className="saved-menu" onKeyDown={handleKeyDown}>
      <Button
        icon={iconBookmark}
        iconEnd={iconChevronDown}
        disabled={disabled}
        {...triggerProps}
        aria-haspopup="dialog"
        size="xs"
      >
        {triggerLabel}
      </Button>

      <AnchoredLayer
        anchorRef={rootRef}
        floatingRef={panelRef}
        open={open}
        exitDuration={DURATION_INSTANT_MS}
        id={menuId}
        className="saved-menu__panel"
        placement={placement}
        role="dialog"
        label={title}
      >
        <p className="saved-menu__caption">{caption}</p>
        {list}

        <div className="saved-menu__divider" role="separator" />

        {naming ? (
          <div className="saved-menu__save">
            <TextInput
              ref={nameRef}
              size="sm"
              className="saved-menu__input"
              aria-label={nameLabel}
              placeholder="Name"
              value={name}
              maxLength={maxNameLength}
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
            className="saved-menu__option"
            disabled={toEntry === null}
            title={toEntry === null ? blockedReason : undefined}
            onClick={() => {
              save.reset();
              setNaming(true);
            }}
          >
            <Icon icon={iconBookmarkPlus} className="saved-menu__icon" />
            {saveLabel}
          </button>
        )}

        {failure && (
          <p className="saved-menu__error" role="alert">
            {formatApiError(failure)}
          </p>
        )}
      </AnchoredLayer>
    </div>
  );
}
