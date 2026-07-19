import { describe, it, expect } from "vitest";
import { shouldDismissOnOverlayInteraction } from "@/components/ui/modal-dismiss";

describe("shouldDismissOnOverlayInteraction", () => {
  it("dismisses on a genuine backdrop click (press and release both on the overlay)", () => {
    expect(
      shouldDismissOnOverlayInteraction({ pressStartedOnOverlay: true, clickTargetIsOverlay: true }),
    ).toBe(true);
  });

  it("does NOT dismiss when a drag-select starts inside the modal and releases on the backdrop (#310)", () => {
    // pointerdown landed on modal content (not the overlay); the click target resolves to the
    // overlay because it is the common ancestor of the down/up targets. Must stay open.
    expect(
      shouldDismissOnOverlayInteraction({ pressStartedOnOverlay: false, clickTargetIsOverlay: true }),
    ).toBe(false);
  });

  it("does NOT dismiss when the click lands on modal content", () => {
    expect(
      shouldDismissOnOverlayInteraction({ pressStartedOnOverlay: false, clickTargetIsOverlay: false }),
    ).toBe(false);
  });

  it("does NOT dismiss when a backdrop press releases over modal content", () => {
    expect(
      shouldDismissOnOverlayInteraction({ pressStartedOnOverlay: true, clickTargetIsOverlay: false }),
    ).toBe(false);
  });
});
