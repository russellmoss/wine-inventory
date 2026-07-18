import { describe, it, expect } from "vitest";
import { lotExpiryStatus, expiryLabel, docRoleLabel } from "@/lib/cellar/lot-history";

// Plan 072 Unit 10 (read side): the per-lot history panel's pure logic — expiry classification + labels.
const NOW = new Date("2026-07-17T12:00:00Z");

describe("lotExpiryStatus", () => {
  it("returns null when there's no expiry (most supply lots) or the value is unparseable", () => {
    expect(lotExpiryStatus(null, NOW)).toBeNull();
    expect(lotExpiryStatus(undefined, NOW)).toBeNull();
    expect(lotExpiryStatus("not-a-date", NOW)).toBeNull();
  });

  it("flags an already-past expiry as expired (negative daysUntil)", () => {
    const r = lotExpiryStatus("2026-07-10T00:00:00Z", NOW);
    expect(r?.status).toBe("expired");
    expect(r!.daysUntil).toBeLessThan(0);
  });

  it("flags within the near-expiry window as soon, beyond it as ok", () => {
    expect(lotExpiryStatus("2026-08-01T00:00:00Z", NOW)?.status).toBe("soon"); // ~15 days
    expect(lotExpiryStatus("2026-12-01T00:00:00Z", NOW)?.status).toBe("ok"); // months out
  });

  it("respects a custom soonDays window", () => {
    expect(lotExpiryStatus("2026-08-30T00:00:00Z", NOW, 90)?.status).toBe("soon");
    expect(lotExpiryStatus("2026-08-30T00:00:00Z", NOW, 7)?.status).toBe("ok");
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(lotExpiryStatus(new Date("2026-07-10T00:00:00Z"), NOW)?.status).toBe("expired");
  });
});

describe("expiryLabel", () => {
  it("phrases each status", () => {
    expect(expiryLabel(null)).toBe("");
    expect(expiryLabel({ status: "expired", daysUntil: -3 })).toBe("Expired 3d ago");
    expect(expiryLabel({ status: "soon", daysUntil: 0 })).toBe("Expires today");
    expect(expiryLabel({ status: "soon", daysUntil: 5 })).toBe("Expires in 5d");
    expect(expiryLabel({ status: "ok", daysUntil: 200 })).toBe("Expires in 200d");
  });
});

describe("docRoleLabel", () => {
  it("maps the known roles and title-cases anything else", () => {
    expect(docRoleLabel("INVOICE")).toBe("Invoice");
    expect(docRoleLabel("coa")).toBe("COA");
    expect(docRoleLabel("packing_slip")).toBe("Packing_slip");
  });
});
