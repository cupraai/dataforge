/** Joins a saved snippet to what is typed, so several fragments can be combined. */
export function appendSnippet(current: string, text: string): string {
  const kept = current.trimEnd();
  return kept ? `${kept}\n\n${text}` : text;
}
