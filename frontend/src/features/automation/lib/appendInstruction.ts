/** Joins a saved instruction to what is typed, so several fragments can be combined. */
export function appendInstruction(current: string, text: string): string {
  const kept = current.trimEnd();
  return kept ? `${kept}\n\n${text}` : text;
}
