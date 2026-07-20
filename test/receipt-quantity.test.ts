import { describe, it, expect } from "vitest";
import { resolveReceiptQuantity } from "@/lib/units/receipt-quantity";
import type { ExtraUnits } from "@/lib/units/measure";

// Plan 080 U15 — receiving in the unit you BUY in, not the unit the app stores in.
//
// Field reports: "labels can only be received in grams" (#366) and a "roll" doesn't say how many labels are
// on it (#370). A count-dimension custom unit already carries its pack size as perCanonical (plan 075); what
// was missing was a way to state a receipt in it. This resolver is the money seam — it sets the
// per-stock-unit cost every future depletion charges to wine — so it is pure and tested at pack boundaries.

// The tenant's own units: a roll of 500 labels, a case of 12 bottles, a 200 kg drum.
const EXTRA: ExtraUnits = {
  roll: { dimension: "count", perCanonical: 500 },
  case: { dimension: "count", perCanonical: 12 },
  drum: { dimension: "mass", perCanonical: 200_000 },
};

describe("resolveReceiptQuantity — pack conversion (plan 080 U15)", () => {
  it("resolves 3 rolls of 500 into 1,500 labels — the reported ask", () => {
    const r = resolveReceiptQuantity({ qty: 3, qtyUnit: "roll", stockUnit: "unit", extraUnits: EXTRA });
    expect(r).toMatchObject({ ok: true, qty: 1500 });
  });

  it("prices the pack correctly: $250 a roll becomes $0.50 a label", () => {
    const r = resolveReceiptQuantity({ qty: 3, qtyUnit: "roll", unitCost: 250, stockUnit: "unit", extraUnits: EXTRA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qty).toBe(1500);
    expect(r.unitCost).toBeCloseTo(0.5, 10);
    // What matters for COST-1: the total booked is exactly the total paid.
    expect(r.qty * (r.unitCost ?? 0)).toBeCloseTo(3 * 250, 8);
  });

  it("preserves the total paid even when the per-unit price does not divide evenly", () => {
    // $100 over a 3-count pack: per-unit is a repeating decimal, but the total must not drift.
    const packs: ExtraUnits = { trio: { dimension: "count", perCanonical: 3 } };
    const r = resolveReceiptQuantity({ qty: 1, qtyUnit: "trio", unitCost: 100, stockUnit: "unit", extraUnits: packs });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qty * (r.unitCost ?? 0)).toBeCloseTo(100, 8);
  });

  it("converts mass packs too — a 200 kg drum into a gram-tracked material", () => {
    const r = resolveReceiptQuantity({ qty: 2, qtyUnit: "drum", unitCost: 400, stockUnit: "g", extraUnits: EXTRA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qty).toBe(400_000);
    expect(r.qty * (r.unitCost ?? 0)).toBeCloseTo(800, 6);
  });

  it("built-in units work without any custom registry — receive pounds into grams", () => {
    const r = resolveReceiptQuantity({ qty: 1, qtyUnit: "lb", stockUnit: "g" });
    expect(r).toMatchObject({ ok: true, qty: 453.59237 });
  });

  it("is a no-op when the unit matches the stock unit (every pre-U15 caller)", () => {
    for (const qtyUnit of [undefined, null, "", "  ", "unit", "UNIT"]) {
      const r = resolveReceiptQuantity({ qty: 42, qtyUnit, unitCost: 1.25, stockUnit: "unit", extraUnits: EXTRA });
      expect(r, String(qtyUnit)).toMatchObject({ ok: true, qty: 42, unitCost: 1.25 });
    }
  });

  it("REFUSES a cross-dimension receipt rather than fabricating a density (COST-1)", () => {
    const r = resolveReceiptQuantity({ qty: 5, qtyUnit: "L", stockUnit: "g", extraUnits: EXTRA });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/measure different things/i);
  });

  it("REFUSES an unknown unit rather than guessing", () => {
    const r = resolveReceiptQuantity({ qty: 5, qtyUnit: "pallet", stockUnit: "unit", extraUnits: EXTRA });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/isn't a unit this winery knows/i);
  });

  it("keeps unknown cost UNKNOWN — never fabricates $0 (COST-2)", () => {
    for (const unitCost of [undefined, null, -1, Number.NaN]) {
      const r = resolveReceiptQuantity({ qty: 2, qtyUnit: "roll", unitCost, stockUnit: "unit", extraUnits: EXTRA });
      expect(r.ok, String(unitCost)).toBe(true);
      if (!r.ok) return;
      expect(r.unitCost, String(unitCost)).toBeNull();
    }
  });

  it("rejects a non-positive quantity", () => {
    for (const qty of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveReceiptQuantity({ qty, qtyUnit: "roll", stockUnit: "unit", extraUnits: EXTRA }).ok, String(qty)).toBe(false);
    }
  });

  it("a custom unit cannot shadow a built-in — 'kg' stays 1,000 g even if a tenant defines it", () => {
    const rogue: ExtraUnits = { kg: { dimension: "count", perCanonical: 7 } };
    const r = resolveReceiptQuantity({ qty: 1, qtyUnit: "kg", stockUnit: "g", extraUnits: rogue });
    expect(r).toMatchObject({ ok: true, qty: 1000 });
  });
});
