import { describe, it, expect } from "vitest";
import {
  assertWorkOrderTransition,
  assertTaskTransition,
  isLegalWorkOrderTransition,
  isLegalTaskTransition,
  rollUpWorkOrderStatus,
} from "@/lib/work-orders/status";

describe("work order status machine", () => {
  it("allows the legal shell path DRAFT → ISSUED → IN_PROGRESS → PENDING_APPROVAL → APPROVED", () => {
    expect(() => assertWorkOrderTransition("DRAFT", "ISSUED")).not.toThrow();
    expect(() => assertWorkOrderTransition("ISSUED", "IN_PROGRESS")).not.toThrow();
    expect(() => assertWorkOrderTransition("IN_PROGRESS", "PENDING_APPROVAL")).not.toThrow();
    expect(() => assertWorkOrderTransition("PENDING_APPROVAL", "APPROVED")).not.toThrow();
  });

  it("rejects illegal shell moves", () => {
    expect(() => assertWorkOrderTransition("APPROVED", "DRAFT")).toThrow();
    expect(() => assertWorkOrderTransition("CANCELLED", "ISSUED")).toThrow();
    expect(() => assertWorkOrderTransition("DRAFT", "APPROVED")).toThrow();
    expect(isLegalWorkOrderTransition("APPROVED", "CANCELLED")).toBe(false);
  });

  it("allows cancelling from any non-terminal state", () => {
    for (const s of ["DRAFT", "ISSUED", "IN_PROGRESS", "PENDING_APPROVAL"] as const) {
      expect(() => assertWorkOrderTransition(s, "CANCELLED")).not.toThrow();
    }
  });
});

describe("work order task status machine", () => {
  it("allows the operation path PENDING → IN_PROGRESS → PENDING_APPROVAL → APPROVED", () => {
    expect(() => assertTaskTransition("PENDING", "IN_PROGRESS")).not.toThrow();
    expect(() => assertTaskTransition("IN_PROGRESS", "PENDING_APPROVAL")).not.toThrow();
    expect(() => assertTaskTransition("PENDING_APPROVAL", "APPROVED")).not.toThrow();
  });

  it("allows the observation shortcut PENDING → DONE (no approval gate)", () => {
    expect(() => assertTaskTransition("PENDING", "DONE")).not.toThrow();
    expect(isLegalTaskTransition("IN_PROGRESS", "DONE")).toBe(true);
  });

  it("allows reject → resubmit (REJECTED → PENDING, decision 1)", () => {
    expect(() => assertTaskTransition("PENDING_APPROVAL", "REJECTED")).not.toThrow();
    expect(() => assertTaskTransition("REJECTED", "PENDING")).not.toThrow();
  });

  it("rejects illegal task moves", () => {
    expect(() => assertTaskTransition("APPROVED", "REJECTED")).toThrow();
    expect(() => assertTaskTransition("DONE", "APPROVED")).toThrow();
    expect(() => assertTaskTransition("PENDING", "APPROVED")).toThrow(); // must go through PENDING_APPROVAL
  });
});

describe("rollUpWorkOrderStatus", () => {
  it("keeps DRAFT/CANCELLED/APPROVED unchanged (explicitly set states)", () => {
    expect(rollUpWorkOrderStatus("DRAFT", ["PENDING"])).toBe("DRAFT");
    expect(rollUpWorkOrderStatus("CANCELLED", ["APPROVED"])).toBe("CANCELLED");
    expect(rollUpWorkOrderStatus("APPROVED", ["APPROVED"])).toBe("APPROVED");
  });

  it("rolls to IN_PROGRESS when any task has started but work is still open", () => {
    expect(rollUpWorkOrderStatus("ISSUED", ["IN_PROGRESS", "PENDING"])).toBe("IN_PROGRESS");
    expect(rollUpWorkOrderStatus("ISSUED", ["PENDING", "PENDING"])).toBe("ISSUED"); // nothing started
  });

  it("rolls to PENDING_APPROVAL when all tasks settled and ≥1 awaits review", () => {
    expect(rollUpWorkOrderStatus("IN_PROGRESS", ["PENDING_APPROVAL", "DONE"])).toBe("PENDING_APPROVAL");
    expect(rollUpWorkOrderStatus("IN_PROGRESS", ["PENDING_APPROVAL", "APPROVED"])).toBe("PENDING_APPROVAL");
  });

  it("rolls to APPROVED when every task is finalized/observed/skipped and none awaits review", () => {
    expect(rollUpWorkOrderStatus("PENDING_APPROVAL", ["APPROVED", "DONE", "SKIPPED"])).toBe("APPROVED");
    expect(rollUpWorkOrderStatus("IN_PROGRESS", ["DONE", "DONE"])).toBe("APPROVED"); // all observations
  });

  it("does not settle while an operation task is still IN_PROGRESS", () => {
    expect(rollUpWorkOrderStatus("IN_PROGRESS", ["IN_PROGRESS", "PENDING_APPROVAL"])).toBe("IN_PROGRESS");
  });
});
