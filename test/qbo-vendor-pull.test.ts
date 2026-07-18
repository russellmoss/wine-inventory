import { describe, it, expect } from "vitest";
import { reconcileQboVendors, type PulledVendor, type LocalVendorRef } from "@/lib/vendors/qbo-vendor-pull-shared";

const qv = (externalId: string, name: string, active = true): PulledVendor => ({ externalId, name, active });
const lv = (id: string, name: string, externalVendorId: string | null = null): LocalVendorRef => ({ id, name, externalVendorId });

describe("reconcileQboVendors", () => {
  it("collapses currency variants into ONE candidate keyed on the non-suffixed base", () => {
    const { candidates } = reconcileQboVendors(
      [qv("1", "Acme"), qv("2", "Acme (EUR)"), qv("3", "Acme (NZD)")],
      [],
      new Set(),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ externalVendorId: "1", name: "Acme" });
    expect(candidates[0].currencyVariantIds.sort()).toEqual(["1", "2", "3"]);
  });

  it("collapses a suffix-only group and strips the suffix for the name", () => {
    const { candidates } = reconcileQboVendors([qv("9", "Acme (EUR)")], [], new Set());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ externalVendorId: "9", name: "Acme" });
  });

  it("skips a group already linked by externalVendorId (synced) — including via a variant id", () => {
    const r1 = reconcileQboVendors([qv("3", "Beta")], [lv("v1", "Beta", "3")], new Set());
    expect(r1.candidates).toHaveLength(0);
    expect(r1.skippedSynced).toBe(1);
    // synced via a currency variant's id
    const r2 = reconcileQboVendors([qv("4", "Gamma"), qv("5", "Gamma (EUR)")], [lv("v2", "Gamma", "5")], new Set());
    expect(r2.candidates).toHaveLength(0);
    expect(r2.skippedSynced).toBe(1);
  });

  it("suppresses a rejected tombstone id", () => {
    const { candidates, skippedRejected } = reconcileQboVendors([qv("6", "Delta")], [], new Set(["6"]));
    expect(candidates).toHaveLength(0);
    expect(skippedRejected).toBe(1);
  });

  it("sets suggestedVendorId to the top HIGH local name match (Plan 074 matcher)", () => {
    const { candidates } = reconcileQboVendors([qv("7", "Scott Laboratories")], [lv("v9", "Scott Labs")], new Set());
    expect(candidates).toHaveLength(1);
    expect(candidates[0].suggestedVendorId).toBe("v9");
  });

  it("emits a plain candidate (no suggestion) for a genuinely new vendor", () => {
    const { candidates } = reconcileQboVendors([qv("8", "Zephyr Cooperage")], [lv("v1", "Scott Labs")], new Set());
    expect(candidates).toHaveLength(1);
    expect(candidates[0].suggestedVendorId).toBeNull();
  });

  it("ignores blank-name QBO vendors", () => {
    const { candidates } = reconcileQboVendors([qv("10", ""), qv("11", "   ")], [], new Set());
    expect(candidates).toHaveLength(0);
  });

  it("is idempotent — same inputs produce identical output", () => {
    const qbo = [qv("1", "Acme"), qv("2", "Acme (EUR)"), qv("7", "Scott Laboratories"), qv("8", "New Co")];
    const existing = [lv("v9", "Scott Labs"), lv("v1", "Beta", "99")];
    const a = reconcileQboVendors(qbo, existing, new Set());
    const b = reconcileQboVendors(qbo, existing, new Set());
    expect(a).toEqual(b);
  });
});
