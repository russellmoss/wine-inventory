import { describe, expect, it } from "vitest";
import {
  assertFeedbackStatusForSource,
  parseFeedbackItemUpdate,
} from "@/lib/developer/feedback-item-input";
import {
  automationRetryMatchesRoute,
  canRetryAutomationDispatch,
} from "@/lib/feedback/automation";

const valid = {
  tenantId: "org_demo_winery",
  sourceType: "FEEDBACK_TICKET",
  id: "ticket:067",
  severity: "P1",
  triageClass: "DEFECT",
  status: "IN_PROGRESS",
  expectedNotesVersion: 3,
} as const;

describe("developer feedback item input", () => {
  it("parses an exact ticket update and intentional clears", () => {
    expect(parseFeedbackItemUpdate(valid)).toMatchObject({
      severity: "P1",
      triageClass: "DEFECT",
      status: "IN_PROGRESS",
      expectedNotesVersion: 3,
    });
    expect(
      parseFeedbackItemUpdate({ ...valid, severity: "", triageClass: "" }),
    ).toMatchObject({ severity: null, triageClass: null });
  });

  it("rejects malformed enum values instead of silently clearing data", () => {
    expect(() => parseFeedbackItemUpdate({ ...valid, severity: "P9" })).toThrow(
      "Invalid feedback severity.",
    );
    expect(() => parseFeedbackItemUpdate({ ...valid, triageClass: "WHO_KNOWS" })).toThrow(
      "Invalid feedback disposition.",
    );
  });

  it("requires a positive revision for every save", () => {
    expect(() =>
      parseFeedbackItemUpdate({ ...valid, expectedNotesVersion: undefined }),
    ).toThrow("Reload this feedback item before saving.");
  });

  it("rejects the unsupported assistant in-progress status", () => {
    expect(() =>
      assertFeedbackStatusForSource("ASSISTANT_FEEDBACK", "IN_PROGRESS"),
    ).toThrow("Assistant feedback does not support the in-progress status.");
    expect(() =>
      parseFeedbackItemUpdate({ ...valid, sourceType: "ASSISTANT_FEEDBACK" }),
    ).toThrow("Assistant feedback does not support the in-progress status.");
  });

  it("only permits retries for known non-dispatch failures", () => {
    expect(
      canRetryAutomationDispatch({
        status: "QUEUED",
        error:
          "GitHub dispatch is not configured. Set GITHUB_REPOSITORY and GITHUB_DISPATCH_TOKEN.",
      }),
    ).toBe(true);
    expect(
      canRetryAutomationDispatch({ status: "FAILED", error: "GitHub dispatch failed: 503" }),
    ).toBe(true);
    expect(
      canRetryAutomationDispatch({
        status: "FAILED",
        error: "GitHub dispatch outcome is unknown after a transport failure: timeout.",
      }),
    ).toBe(false);
    expect(automationRetryMatchesRoute("AGENTIC_FIX", "PRODUCT_GAP")).toBe(false);
    expect(automationRetryMatchesRoute("PLAN", "PRODUCT_GAP")).toBe(true);
  });
});
