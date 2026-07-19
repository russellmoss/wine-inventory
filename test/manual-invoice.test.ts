import { describe, it, expect } from "vitest";
import { buildManualInvoiceDocument } from "@/lib/ingest/manual-invoice-core";
import { allocateLandedCost } from "@/lib/ingest/landed-cost";

// Plan 080 U4 — manual invoice entry. The point of this unit is that a hand-typed invoice is
// INDISTINGUISHABLE from an AI-extracted one downstream: same ExtractedDocument shape, same staging core,
// same apply, so the aggregate A/P (ONE apinv:<id> bill — AP-1), landed-cost allocation, FX (COST-4) and the
// reconciliation gates are shared rather than re-implemented. These lock the pure build/validate step; the
// end-to-end "manual invoice applies to N SupplyLots + ONE A/P event" assertion lives in verify:ingest
// (live Neon), because that is the only place the whole apply chain is real.

const LOC = "loc_lab";
const base = { vendorName: "Acme Cellar Supply", locationId: LOC };

describe("buildManualInvoiceDocument — shape parity with the extractor", () => {
  it("produces a docType:invoice document the apply path can consume unchanged", () => {
    const { document, fileName } = buildManualInvoiceDocument({
      ...base,
      invoiceNumber: "INV-1001",
      invoiceDate: new Date("2026-07-19T00:00:00.000Z"),
      currency: "USD",
      invoiceTotal: 240,
      lines: [{ description: "Bentonite", qty: 2, unit: "25 kg", unitPrice: 100, lineTotal: 200 }],
      charges: { shipping: 40, tax: null },
    });

    expect(document.docType).toBe("invoice");
    expect(document.vendor).toEqual({ name: "Acme Cellar Supply" });
    expect(document.invoiceNumber).toBe("INV-1001");
    expect(document.invoiceTotal).toBe(240);
    expect(document.currency).toBe("USD");
    expect(document.lines).toHaveLength(1);
    // human-only fields ride in extractedJson — no schema change needed for location/date
    expect(document.locationId).toBe(LOC);
    expect(document.invoiceDate).toBe("2026-07-19T00:00:00.000Z");
    expect(document.manualEntry).toBe(true);
    expect(fileName).toBe("Manual entry — INV-1001");
  });

  it("derives a missing lineTotal from qty × unitPrice (the charge-allocation basis needs it)", () => {
    const { document } = buildManualInvoiceDocument({
      ...base,
      lines: [{ description: "DAP", qty: 3, unitPrice: 12.5 }],
    });
    expect(document.lines[0].lineTotal).toBe(37.5);
  });

  it("leaves an unpriced line's total NULL — unknown cost, never a fabricated $0 (COST-2)", () => {
    const { document } = buildManualInvoiceDocument({
      ...base,
      lines: [{ description: "Free sample", qty: 1 }],
    });
    expect(document.lines[0].lineTotal).toBeNull();
    expect(document.lines[0].unitPrice).toBeNull();
  });

  it("drops blank trailing rows (normal in a spreadsheet-style form) without failing the entry", () => {
    const { document } = buildManualInvoiceDocument({
      ...base,
      lines: [{ description: "Bentonite", qty: 1, unitPrice: 10 }, { description: "   " }, { description: "" }],
    });
    expect(document.lines).toHaveLength(1);
  });

  it("the built lines feed allocateLandedCost exactly like extracted ones", () => {
    const { document } = buildManualInvoiceDocument({
      ...base,
      lines: [
        { description: "A", qty: 1, unitPrice: 100, lineTotal: 100 },
        { description: "B", qty: 1, unitPrice: 100, lineTotal: 100 },
      ],
      charges: { shipping: 40, tax: 17 }, // tax is EXCLUDED from capitalized landed cost
    });
    const alloc = allocateLandedCost(
      document.lines.map((l) => l.lineTotal ?? null),
      document.charges ?? {},
    );
    // $40 shipping splits evenly across two equal lines ($20 each); the $17 tax never capitalizes.
    expect(alloc.map((a) => a.landedLineTotal)).toEqual([120, 120]);
    const total = alloc.reduce<number>((s, a) => s + (a.landedLineTotal ?? 0), 0);
    expect(total).toBe(240); // Σ subtotals (200) + allocatable charges (40), tax excluded
  });
});

describe("buildManualInvoiceDocument — validation", () => {
  it("requires a vendor and at least one real line", () => {
    expect(() => buildManualInvoiceDocument({ ...base, vendorName: "  ", lines: [{ description: "X" }] })).toThrow(/vendor/i);
    expect(() => buildManualInvoiceDocument({ ...base, lines: [] })).toThrow(/at least one line/i);
    expect(() => buildManualInvoiceDocument({ ...base, lines: [{ description: "   " }] })).toThrow(/at least one line/i);
  });

  it("refuses negative quantities and prices", () => {
    expect(() => buildManualInvoiceDocument({ ...base, lines: [{ description: "X", qty: -1 }] })).toThrow(/can't be negative/);
    expect(() => buildManualInvoiceDocument({ ...base, lines: [{ description: "X", unitPrice: -5 }] })).toThrow(/can't be negative/);
  });

  it("WAVE-1 (council C6): hard-refuses a non-MATERIAL line instead of misposting it as a consumable", () => {
    expect(() =>
      buildManualInvoiceDocument({ ...base, lines: [{ description: "Must pump", targetKind: "EQUIPMENT_ASSET" }] }),
    ).toThrow(/equipment/i);
    expect(() =>
      buildManualInvoiceDocument({ ...base, lines: [{ description: "Merch tee", targetKind: "FINISHED_GOOD" }] }),
    ).toThrow(/finished good/i);
    // an explicit MATERIAL target is fine, as is omitting it entirely
    expect(() => buildManualInvoiceDocument({ ...base, lines: [{ description: "Bentonite", targetKind: "MATERIAL" }] })).not.toThrow();
    expect(() => buildManualInvoiceDocument({ ...base, lines: [{ description: "Bentonite" }] })).not.toThrow();
  });
});
