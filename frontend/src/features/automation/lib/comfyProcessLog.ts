/** Slack for sub-pixel scroll heights and browser zoom; an exact comparison never holds. */
const BOTTOM_EPSILON_PX = 8;

/** Follow new output until the reader scrolls up; resume at the bottom. */
export function shouldStickToBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= BOTTOM_EPSILON_PX;
}
