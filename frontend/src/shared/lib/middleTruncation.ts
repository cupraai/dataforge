/** Characters of the stem kept beside the extension, where numbered names differ. */
const TAIL_STEM_LENGTH = 8;
/** A head shorter than this would truncate to almost nothing, so the name stays whole. */
const MIN_HEAD_LENGTH = 4;

/** The part that may be cut and the end that always shows, such as `21065-audio.mp4`. */
export function splitForMiddleTruncation(text: string): [head: string, tail: string] {
  const dot = text.lastIndexOf(".");
  const extension = dot > 0 ? text.slice(dot) : "";
  const tailLength = extension.length + TAIL_STEM_LENGTH;
  if (text.length - tailLength < MIN_HEAD_LENGTH) return [text, ""];
  return [text.slice(0, -tailLength), text.slice(-tailLength)];
}
