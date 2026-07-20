/**
 * Decide whether an open InfoHint popover should dismiss in response to a pointer
 * press somewhere on the page.
 *
 * The hint opens on hover / focus / tap and — unlike a bare CSS tooltip — STAYS
 * open when the cursor moves off the trigger, so the user can move the mouse onto
 * the bubble to read or select its text (#371). Closing it on cursor-leave was the
 * defect: with a gap between the trigger and the bubble, the bubble was literally
 * unreachable — the moment the cursor left the trigger the bubble vanished.
 *
 * Dismissal is therefore gated on where the pointer press ORIGINATED — exactly the
 * pattern shipped for the modal backdrop in issue #310 / PR #318. A press that
 * begins inside the hint (its trigger or its bubble) keeps it open; a press that
 * begins anywhere else dismisses it. (Escape also dismisses, handled in the
 * component.)
 *
 * Pure so it can be unit-tested without a DOM; the component supplies the boolean
 * from `hintRoot.contains(pointerDownTarget)`.
 */
export function shouldDismissHintOnPointerDown(args: {
  /** The pointerdown that began this interaction landed inside the hint (trigger or bubble). */
  pressStartedInsideHint: boolean;
}): boolean {
  return !args.pressStartedInsideHint;
}
