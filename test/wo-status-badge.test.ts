import { describe, it, expect } from "vitest";
import { statusTone, statusLabel, STATUS_TONE } from "@/lib/work-orders/status-badge";

describe("statusTone", () => {
  it("maps every WorkOrderStatus / WorkOrderTaskStatus value to the app color language", () => {
    expect(statusTone("DRAFT")).toBe("neutral");
    expect(statusTone("ISSUED")).toBe("blue");
    expect(statusTone("IN_PROGRESS")).toBe("gold");
    expect(statusTone("PENDING_APPROVAL")).toBe("maroon");
    expect(statusTone("APPROVED")).toBe("green");
    expect(statusTone("CANCELLED")).toBe("neutral");
    expect(statusTone("PENDING")).toBe("neutral");
    expect(statusTone("REJECTED")).toBe("red");
    expect(statusTone("DONE")).toBe("green");
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
});

describe("statusLabel", () => {
  it("underscores → spaces, sentence-case", () => {
    expect(statusLabel("PENDING_APPROVAL")).toBe("Pending approval");
    expect(statusLabel("ISSUED")).toBe("Issued");
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(statusLabel("DONE")).toBe("Done");
  });
});
