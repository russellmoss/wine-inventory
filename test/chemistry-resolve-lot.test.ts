import { describe, it, expect } from "vitest";
import { resolveResidentLot } from "@/lib/chemistry/resolve-lot";

describe("resolveResidentLot", () => {
  it("auto-attaches when the vessel holds exactly one lot", () => {
    expect(resolveResidentLot(["lot-a"])).toEqual({ ok: true, lotId: "lot-a" });
    // an explicit pick that matches the sole resident is fine
    expect(resolveResidentLot(["lot-a"], "lot-a")).toEqual({ ok: true, lotId: "lot-a" });
  });

  // LEDGER-12 (plan 088): a vessel holds ONE cohesive liquid, so there is no "which lot?" to ask.
  // This used to assert `{ ok: false, reason: "ambiguous" }` — the outcome that forced a picker
  // onto every per-lot record in the app.
  it("never asks which lot: a legacy multi-resident vessel resolves to the wine that is in it", () => {
    // listResidentLots orders by volume desc, so the first entry is the dominant holding. A row
    // that predates the invariant still gets a reading recorded rather than being refused.
    expect(resolveResidentLot(["lot-a", "lot-b"])).toEqual({ ok: true, lotId: "lot-a" });
    // An explicit pick is still honoured — that is how a caller pins a lot BY CODE.
    expect(resolveResidentLot(["lot-a", "lot-b"], "lot-b")).toEqual({ ok: true, lotId: "lot-b" });
  });

  it("rejects an explicit lot that isn't resident (1 or many)", () => {
    expect(resolveResidentLot(["lot-a"], "lot-z")).toEqual({ ok: false, reason: "not_resident" });
    expect(resolveResidentLot(["lot-a", "lot-b"], "lot-z")).toEqual({ ok: false, reason: "not_resident" });
  });

  it("reports empty when the vessel holds nothing", () => {
    expect(resolveResidentLot([])).toEqual({ ok: false, reason: "empty" });
    expect(resolveResidentLot([], "lot-a")).toEqual({ ok: false, reason: "empty" });
  });
});
