// Should an auto-scrolling transcript follow new content, or stay where the user put it?
//
// The chat used to snap to the bottom unconditionally on every change. That was fine
// when voice was a separate full-screen surface, but inline voice (plan 089) makes the
// shared transcript the caption stream, and an unconditional snap means the user can
// never scroll back to re-read a number mid-conversation — every turn yanks them down.
//
// Pure and DOM-free (takes measurements, not an element) so it is testable: this repo
// runs vitest with `environment: "node"`, so anything touching a real element is not.

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/**
 * How far from the bottom still counts as "following". Generous on purpose: a couple of
 * lines of drift from a streaming reply or an image settling must not be mistaken for
 * the user deliberately scrolling away.
 */
export const STICK_TO_BOTTOM_SLOP_PX = 80;

export function shouldStickToBottom(m: ScrollMetrics, slop: number = STICK_TO_BOTTOM_SLOP_PX): boolean {
  // Not scrollable yet (content shorter than the viewport): always follow, otherwise the
  // very first message would never scroll into view.
  if (m.scrollHeight <= m.clientHeight) return true;
  const distanceFromBottom = m.scrollHeight - m.scrollTop - m.clientHeight;
  return distanceFromBottom <= slop;
}
