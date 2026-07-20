import { describe, expect, it } from "vitest";
import {
  FEEDBACK_KIND_OPTIONS,
  feedbackKindOptions,
  type FeedbackKind,
} from "@/lib/feedback/kind-options";

describe("feedbackKindOptions", () => {
  it("offers both kinds when the picker is not locked", () => {
    const options = feedbackKindOptions("BUG_REPORT", false);
    expect(options.map((o) => o.value)).toEqual(["BUG_REPORT", "FEATURE_REQUEST"]);
  });

  it("lets a reporter reach FEATURE_REQUEST from an unlocked picker", () => {
    // The regression: the assistant report widget rendered "Feature request"
    // but locked the kind, so every submission was forced to BUG_REPORT.
    const options = feedbackKindOptions("BUG_REPORT", false);
    expect(options.some((o) => o.value === "FEATURE_REQUEST")).toBe(true);
  });

  it("collapses to the kind in force when locked, rather than showing a dead option", () => {
    expect(feedbackKindOptions("BUG_REPORT", true).map((o) => o.value)).toEqual(["BUG_REPORT"]);
    expect(feedbackKindOptions("FEATURE_REQUEST", true).map((o) => o.value)).toEqual(["FEATURE_REQUEST"]);
  });

  it("never renders an option it would refuse to select (the invariant)", () => {
    const kinds: FeedbackKind[] = ["BUG_REPORT", "FEATURE_REQUEST"];
    for (const kind of kinds) {
      for (const lockKind of [true, false]) {
        const options = feedbackKindOptions(kind, lockKind);
        expect(options.length).toBeGreaterThan(0);
        // Locked => the only rendered option is the one already selected, so
        // clicking any rendered option is always honoured.
        if (lockKind) expect(options).toHaveLength(1);
        for (const option of options) {
          const selectable = !lockKind || option.value === kind;
          expect(selectable).toBe(true);
        }
      }
    }
  });

  it("keeps labels stable for both kinds", () => {
    expect(FEEDBACK_KIND_OPTIONS).toEqual([
      { value: "BUG_REPORT", label: "Bug report" },
      { value: "FEATURE_REQUEST", label: "Feature request" },
    ]);
  });
});
