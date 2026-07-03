import { describe, it, expect } from "vitest";
import { needsAttentionCount } from "@/lib/commerce/dashboard";

// Phase 16 Unit 10 — the pure attention roll-up. The DB-backed dashboard read (delivery counts by
// status, withheld/held-unpaid/drift) is rendered from seeded Demo Winery data in the Unit-11 harness.

describe("needsAttentionCount", () => {
  it("is zero when everything is clean", () => {
    expect(needsAttentionCount({ withheldOrders: 0, heldUnpaid: 0, drifting: 0, failed: 0, webhookStale: false })).toBe(0);
  });
  it("sums every attention source + counts a stale webhook once", () => {
    expect(needsAttentionCount({ withheldOrders: 2, heldUnpaid: 1, drifting: 3, failed: 1, webhookStale: true })).toBe(8);
  });
  it("a healthy webhook adds nothing", () => {
    expect(needsAttentionCount({ withheldOrders: 0, heldUnpaid: 0, drifting: 0, failed: 0, webhookStale: false })).toBe(0);
    expect(needsAttentionCount({ withheldOrders: 1, heldUnpaid: 0, drifting: 0, failed: 0, webhookStale: false })).toBe(1);
  });
});
