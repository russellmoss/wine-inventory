import { describe, it, expect } from "vitest";
import { shouldDismissHintOnPointerDown } from "@/components/ui/info-hint-dismiss";

describe("shouldDismissHintOnPointerDown", () => {
  it("dismisses on a pointer press that originates OUTSIDE the hint (outside click)", () => {
    expect(shouldDismissHintOnPointerDown({ pressStartedInsideHint: false })).toBe(true);
  });

  it("does NOT dismiss when the press originates inside the hint (trigger or bubble) — #371", () => {
    // The whole point: moving the cursor onto the bubble and pressing/selecting text must keep it open.
    expect(shouldDismissHintOnPointerDown({ pressStartedInsideHint: true })).toBe(false);
  });
});
