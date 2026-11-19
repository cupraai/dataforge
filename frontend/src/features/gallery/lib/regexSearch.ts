// s so `.` spans newlines; no m, or each line could satisfy a negation alone.
export const SEARCH_REGEX_FLAGS = "is";

export function compileSearchRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, SEARCH_REGEX_FLAGS);
  } catch {
    return null;
  }
}

/** Backtracking cannot be interrupted, so this runs in a terminable worker. */
export function matchRegexTexts(pattern: string, texts: readonly string[]): boolean[] {
  const compiled = compileSearchRegex(pattern);
  return texts.map((text) => compiled !== null && compiled.test(text));
}

/** Every string a regex search tests for `items`: names, captions and tag labels. */
export function regexSearchTexts(
  items: readonly {
    name: string;
    description?: string | null;
    tags?: readonly { label: string }[];
  }[],
): string[] {
  const texts = new Set<string>();
  for (const item of items) {
    texts.add(item.name);
    if (item.description != null) texts.add(item.description);
    for (const tag of item.tags ?? []) texts.add(tag.label);
  }
  return [...texts];
}
