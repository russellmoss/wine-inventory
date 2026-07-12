import { describe, it, expect } from "vitest";
import { normalizeWorkOrderPriority, normalizeDurationMin, isWorkOrderPriority, PRIORITY_RANK } from "@/lib/work-orders/planning";

// Plan 053 B8: planning fields are data-capture only, but priority + duration are validated server-side
// (never trust the form). Priority is a closed string set; duration is a non-negative integer of minutes.

describe("normalizeWorkOrderPriority", () => {
  it("accepts the four valid priorities", () => {
    for (const p of ["LOW", "NORMAL", "HIGH", "URGENT"]) expect(normalizeWorkOrderPriority(p)).toBe(p);
  });
  it("treats empty/absent as null (defaults to NORMAL in the UI)", () => {
    expect(normalizeWorkOrderPriority("")).toBeNull();
    expect(normalizeWorkOrderPriority(null)).toBeNull();
    expect(normalizeWorkOrderPriority(undefined)).toBeNull();
  });
  it("throws on an unknown priority", () => {
    expect(() => normalizeWorkOrderPriority("CRITICAL")).toThrow(/invalid priority/i);
    expect(() => normalizeWorkOrderPriority("high")).toThrow(); // case-sensitive
  });
  it("ranks URGENT first, LOW last", () => {
    expect(PRIORITY_RANK.URGENT).toBeLessThan(PRIORITY_RANK.HIGH);
    expect(PRIORITY_RANK.HIGH).toBeLessThan(PRIORITY_RANK.NORMAL);
    expect(PRIORITY_RANK.NORMAL).toBeLessThan(PRIORITY_RANK.LOW);
  });
  it("isWorkOrderPriority guards", () => {
    expect(isWorkOrderPriority("HIGH")).toBe(true);
    expect(isWorkOrderPriority("nope")).toBe(false);
  });
});

describe("normalizeDurationMin", () => {
  it("accepts a non-negative number and rounds it", () => {
    expect(normalizeDurationMin(90)).toBe(90);
    expect(normalizeDurationMin("45")).toBe(45);
    expect(normalizeDurationMin(30.6)).toBe(31);
  });
  it("empty/absent → null", () => {
    expect(normalizeDurationMin("")).toBeNull();
    expect(normalizeDurationMin(null)).toBeNull();
  });
  it("throws on negative or non-numeric", () => {
    expect(() => normalizeDurationMin(-5)).toThrow();
    expect(() => normalizeDurationMin("soon")).toThrow();
  });
});
