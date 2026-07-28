import { describe, it, expect } from "vitest";
import { statusTone, statusLabel, STATUS_TONE } from "@/lib/work-orders/status-badge";
import { STATUS_VARIANTS } from "@/components/ui/status-variants";

describe("statusTone", () => {
  it("maps every WorkOrderStatus / WorkOrderTaskStatus value to the app color language", () => {
    expect(statusTone("DRAFT")).toBe("neutral");
    expect(statusTone("ISSUED")).toBe("active");
    expect(statusTone("IN_PROGRESS")).toBe("active");
    expect(statusTone("PENDING_APPROVAL")).toBe("review");
    expect(statusTone("APPROVED")).toBe("done");
    expect(statusTone("CANCELLED")).toBe("neutral");
    expect(statusTone("PENDING")).toBe("neutral");
    expect(statusTone("REJECTED")).toBe("attention");
    expect(statusTone("DONE")).toBe("done");
    expect(statusTone("SKIPPED")).toBe("neutral");
  });

  it("falls back to neutral for an unknown status (matches the old `?? \"neutral\"`)", () => {
    expect(statusTone("SOMETHING_ELSE")).toBe("neutral");
    expect(statusTone("")).toBe("neutral");
  });

  it("matches the raw STATUS_TONE map for every known key", () => {
    for (const [status, tone] of Object.entries(STATUS_TONE)) {
      expect(statusTone(status)).toBe(tone);
    }
  });

  it("only ever returns one of the six status-ramp variants", () => {
    for (const status of [...Object.keys(STATUS_TONE), "???", ""]) {
      expect(STATUS_VARIANTS).toContain(statusTone(status));
    }
  });

  it("never returns `held` — nothing in the codebase produces a HELD status yet", () => {
    // The variant is built (v2 §A4 marks it Phase-28-gated) but must stay unwired
    // until a real status exists, or it reads as a state the app cannot enter.
    expect(Object.values(STATUS_TONE)).not.toContain("held");
  });
});

describe("statusLabel", () => {
  it("underscores → spaces, sentence-case", () => {
    expect(statusLabel("PENDING_APPROVAL")).toBe("Pending approval");
    expect(statusLabel("ISSUED")).toBe("Issued");
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(statusLabel("DONE")).toBe("Done");
  });
});
