export type CaptionDiffKind = "same" | "removed" | "added";

export interface CaptionDiffSegment {
  kind: CaptionDiffKind;
  text: string;
}

/** Above this many LCS cells the changed middle is shown as one removal and one addition. */
export const WORD_DIFF_CELL_LIMIT = 250_000;

/**
 * Below this share of the shorter side's words surviving, the changed stretch reads as a
 * rewrite: the few chance matches ("a", "the") would otherwise chop it into confetti.
 */
const REWRITE_SHARED_WORDS = 0.3;

interface Token {
  /** Whitespace before the token. Carried along, never aligned on. */
  lead: string;
  /** A word, or one punctuation mark, so a tag list differs by tag rather than by "tag,". */
  text: string;
}

const TOKEN_PATTERN = /(\s*)([\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]|$)/gu;
const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;

/** Ends with an empty token that holds the trailing whitespace. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    tokens.push({ lead: match[1], text: match[2] });
    if (match[2] === "") break;
  }
  return tokens;
}

function isWord(token: Token): boolean {
  return /^[\p{L}\p{N}_]/u.test(token.text);
}

type Op =
  { kind: "same"; before: Token; after: Token } | { kind: "removed" | "added"; token: Token };

/** Word-level diff of two captions, as runs of unchanged, removed and added text. */
export function diffCaptionWords(before: string, after: string): CaptionDiffSegment[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];

  const a = tokenize(before);
  const b = tokenize(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start].text === b[start].text) start += 1;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end].text === b[b.length - 1 - end].text
  ) {
    end += 1;
  }

  const middleA = a.slice(start, a.length - end);
  const middleB = b.slice(start, b.length - end);
  const swap = (): Op[] => [
    ...middleA.map((token): Op => ({ kind: "removed", token })),
    ...middleB.map((token): Op => ({ kind: "added", token })),
  ];
  let middle: Op[];
  if ((middleA.length + 1) * (middleB.length + 1) > WORD_DIFF_CELL_LIMIT) {
    middle = swap();
  } else {
    middle = lcsOps(middleA, middleB);
    if (isRewrite(middle, middleA, middleB)) {
      const sharedEnds = [...a.slice(0, start), ...a.slice(a.length - end)];
      // Nothing but punctuation in common: both captions change as a whole.
      if (!sharedEnds.some(isWord)) {
        return [
          { kind: "removed", text: before },
          { kind: "added", text: after },
        ];
      }
      middle = swap();
    }
  }

  const ops: Op[] = [];
  for (let i = 0; i < start; i += 1) ops.push({ kind: "same", before: a[i], after: b[i] });
  ops.push(...middle);
  for (let i = end; i > 0; i -= 1) {
    ops.push({ kind: "same", before: a[a.length - i], after: b[b.length - i] });
  }
  slideChangesRight(ops);
  return mergeOps(ops);
}

/**
 * Where a one-sided change could sit one token later with the same result, moves it there:
 * ". A cat" inserted before a final "." becomes " A cat." inserted after the kept one, so a
 * whole added or removed sentence is marked as itself.
 */
function slideChangesRight(ops: Op[]): void {
  let start = 0;
  while (start < ops.length) {
    const first = ops[start];
    if (first.kind === "same") {
      start += 1;
      continue;
    }
    let end = start;
    while (end < ops.length && ops[end].kind === first.kind) end += 1;
    const next = ops[end];
    if (next?.kind !== "same") {
      start = end + 1;
      continue;
    }
    const moved = ops[start];
    if (moved.kind === "same" || moved.token.text !== next.before.text) {
      start = end;
      continue;
    }
    const removing = moved.kind === "removed";
    ops.splice(
      start,
      end - start + 1,
      removing
        ? { kind: "same", before: moved.token, after: next.after }
        : { kind: "same", before: next.before, after: moved.token },
      ...ops.slice(start + 1, end),
      { kind: moved.kind, token: removing ? next.before : next.after },
    );
    start += 1;
  }
}

function isRewrite(ops: Op[], a: Token[], b: Token[]): boolean {
  const fewer = Math.min(a.filter(isWord).length, b.filter(isWord).length);
  if (fewer === 0) return false;
  const shared = ops.filter((op) => op.kind === "same" && isWord(op.before)).length;
  return shared / fewer < REWRITE_SHARED_WORDS;
}

function lcsOps(a: Token[], b: Token[]): Op[] {
  const width = b.length + 1;
  // lengths[i * width + j]: LCS length of a[i:] and b[j:].
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i].text === b[j].text
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].text === b[j].text) {
      ops.push({ kind: "same", before: a[i], after: b[j] });
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      ops.push({ kind: "removed", token: a[i] });
      i += 1;
    } else {
      ops.push({ kind: "added", token: b[j] });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) ops.push({ kind: "removed", token: a[i] });
  for (; j < b.length; j += 1) ops.push({ kind: "added", token: b[j] });
  return ops;
}

/**
 * Joins token runs into segments, removals before additions. Whitespace both sides of a
 * change share stays unchanged text, so "red dog" -> "blue cat" reads as one clean swap.
 */
function mergeOps(ops: Op[]): CaptionDiffSegment[] {
  const segments: CaptionDiffSegment[] = [];
  let removed = "";
  let added = "";

  const push = (kind: CaptionDiffKind, text: string) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last?.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };
  /** Emits the pending change, then `tail`: text both sides have right after it. */
  const flush = (tail: string) => {
    let head = 0;
    const shortest = Math.min(removed.length, added.length);
    while (head < shortest && removed[head] === added[head] && isBlank(removed[head])) head += 1;
    push("same", removed.slice(0, head));
    removed = removed.slice(head);
    added = added.slice(head);

    // A one-sided change hands its edge space to the neighbour: "small " goes, not " small".
    const lone = removed && !added ? "removed" : added && !removed ? "added" : null;
    const text = removed || added;
    const edge = /^[^\S\r\n]+/.exec(text)?.[0] ?? "";
    if (lone && edge && edge.length < text.length && tail.startsWith(edge)) {
      push("same", edge);
      push(lone, text.slice(edge.length) + edge);
      push("same", tail.slice(edge.length));
    } else {
      push("removed", removed);
      push("added", added);
      push("same", tail);
    }
    removed = "";
    added = "";
  };

  for (const op of ops) {
    if (op.kind !== "same") {
      const text = op.token.lead + op.token.text;
      if (op.kind === "removed") removed += text;
      else added += text;
    } else if (op.before.lead === op.after.lead) {
      flush(op.before.lead + op.before.text);
    } else {
      removed += op.before.lead;
      added += op.after.lead;
      flush(op.before.text);
    }
  }
  flush("");
  return segments;
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

/** Words each side alone has; punctuation and whitespace do not count. */
export function countChangedWords(segments: CaptionDiffSegment[]): {
  removed: number;
  added: number;
} {
  let removed = 0;
  let added = 0;
  for (const segment of segments) {
    if (segment.kind === "same") continue;
    const words = segment.text.match(WORD_PATTERN)?.length ?? 0;
    if (segment.kind === "removed") removed += words;
    else added += words;
  }
  return { removed, added };
}

const ELLIPSIS = "…";
/** How far a cut may move to land between words rather than inside one. */
const WORD_BOUNDARY_SLACK = 12;

/**
 * Shortens unchanged runs to `contextChars` around each change, so a small edit in a long
 * caption stays in view. Changed text is never cut.
 */
export function collapseDiffContext(
  segments: CaptionDiffSegment[],
  contextChars: number,
): CaptionDiffSegment[] {
  if (!segments.some((segment) => segment.kind !== "same")) return segments;

  return segments.map((segment, index) => {
    if (segment.kind !== "same") return segment;
    const first = index === 0;
    const last = index === segments.length - 1;
    const { text } = segment;
    if (first) {
      return text.length > contextChars ? { ...segment, text: ELLIPSIS + tail(text) } : segment;
    }
    if (last) {
      return text.length > contextChars ? { ...segment, text: head(text) + ELLIPSIS } : segment;
    }
    // Only worth a gap once it hides more than the ellipsis shows.
    if (text.length <= contextChars * 2 + WORD_BOUNDARY_SLACK) return segment;
    return { ...segment, text: `${head(text)} ${ELLIPSIS} ${tail(text)}` };
  });

  function tail(text: string): string {
    const kept = text.slice(-contextChars);
    const space = kept.search(/\s/);
    return space >= 0 && space < WORD_BOUNDARY_SLACK ? kept.slice(space).trimStart() : kept;
  }

  function head(text: string): string {
    const kept = text.slice(0, contextChars);
    const space = kept.search(/\s\S*$/);
    return space > contextChars - WORD_BOUNDARY_SLACK ? kept.slice(0, space).trimEnd() : kept;
  }
}
