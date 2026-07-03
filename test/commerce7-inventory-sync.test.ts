import { describe, it, expect } from "vitest";
import { isIncreaseMovement } from "@/lib/commerce/inventory-sync";
import { computeDrift } from "@/lib/commerce/inventory-drift";

// Phase 16 Unit 6 — the pure outbound-inventory rules. The DB-backed push watermark + drift persistence
// are proven end-to-end in the Unit-9 verify:commerce7-idempotency harness (RECEIVE pushes once, an
// ingested SALE pushes nothing, re-run is a no-op).

describe("isIncreaseMovement — what we mirror to Commerce7", () => {
  it("mirrors RECEIVE and positive ADJUST only", () => {
    expect(isIncreaseMovement("RECEIVE", 12)).toBe(true);
    expect(isIncreaseMovement("ADJUST", 3)).toBe(true);
  });
  it("NEVER mirrors a SALE (C7 already decremented itself)", () => {
    expect(isIncreaseMovement("SALE", -2)).toBe(false);
    expect(isIncreaseMovement("SALE", 2)).toBe(false); // even a refund-restore SALE isn't pushed
  });
  it("NEVER mirrors a negative ADJUST or a TRANSFER", () => {
    expect(isIncreaseMovement("ADJUST", -5)).toBe(false);
    expect(isIncreaseMovement("TRANSFER", 5)).toBe(false);
  });
});

describe("computeDrift — read-only ERP vs Commerce7", () => {
  it("no drift when equal", () => {
    expect(computeDrift(100, 100)).toEqual({ drift: 0, hasDrift: false });
  });
  it("positive drift when ERP has more (C7 under-counts)", () => {
    expect(computeDrift(100, 90)).toEqual({ drift: 10, hasDrift: true });
  });
  it("negative drift when C7 has more (an operator hand-edit)", () => {
    expect(computeDrift(90, 100)).toEqual({ drift: -10, hasDrift: true });
  });
  it("unknown C7 count is treated as drift for review", () => {
    expect(computeDrift(50, null)).toEqual({ drift: 50, hasDrift: true });
  });
});
