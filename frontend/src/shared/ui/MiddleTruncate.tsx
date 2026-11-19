import { classNames } from "@/shared/lib/classNames";
import { splitForMiddleTruncation } from "@/shared/lib/middleTruncation";

interface MiddleTruncateProps {
  text: string;
  className?: string;
}

/**
 * A file name cut in the middle when it does not fit, so the end that tells numbered files apart
 * and the extension stay visible: `showcase_2…65-audio.mp4`.
 */
export function MiddleTruncate({ text, className }: MiddleTruncateProps) {
  const [head, tail] = splitForMiddleTruncation(text);
  return (
    <span className={classNames("middle-truncate", className)}>
      <span className="middle-truncate__head">{head}</span>
      {tail && <span className="middle-truncate__tail">{tail}</span>}
    </span>
  );
}
