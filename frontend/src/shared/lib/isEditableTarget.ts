/** Input types with no text, and so no undo history of their own. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "radio",
  "range",
  "reset",
  "submit",
]);

// The keys a focused radio or checkbox acts on itself: moving the choice, or toggling.
const CHOICE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]);

/** A radio or checkbox keeps only the keys it acts on, so letter shortcuts still work. */
export function isEditableTarget({ target, key }: Pick<KeyboardEvent, "target" | "key">): boolean {
  if (
    target instanceof HTMLInputElement &&
    (target.type === "radio" || target.type === "checkbox")
  ) {
    return CHOICE_KEYS.has(key);
  }
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest(".cm-content") != null ||
        target.closest('[role="slider"]') != null))
  );
}

/** A field being typed in, which keeps keys like Ctrl+Z for its own text. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(target.type)) ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || target.closest(".cm-content") != null))
  );
}
