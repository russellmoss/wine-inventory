/**
 * Decide whether an overlay (backdrop) interaction should dismiss a modal.
 *
 * A modal must dismiss ONLY on a genuine backdrop click — a pointer press that
 * both STARTS and ENDS on the backdrop itself. The "started on the backdrop"
 * half is the part that is easy to miss: without it, a drag-select that begins
 * inside the modal content and releases on the backdrop (e.g. dragging a text
 * selection out to the far-left screen edge) produces a `click` whose target
 * resolves to the common ancestor — the overlay — which silently dismisses the
 * dialog and discards everything the user typed. See issue #310 (the "Report a
 * bug" dialog losing all entered data at the screen edge).
 *
 * Pure so it can be unit-tested without a DOM; the Modal supplies the two
 * booleans from `e.target === e.currentTarget` on pointerdown and on click.
 */
export function shouldDismissOnOverlayInteraction(args: {
  /** The pointerdown that began this interaction landed on the overlay itself. */
  pressStartedOnOverlay: boolean;
  /** The resulting click's target is the overlay itself (not modal content). */
  clickTargetIsOverlay: boolean;
}): boolean {
  return args.pressStartedOnOverlay && args.clickTargetIsOverlay;
}
