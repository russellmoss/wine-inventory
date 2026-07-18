import { describe, it, expect } from "vitest";
import {
  isReceiptDoc,
  effectiveDecision,
  lineSubtotal,
  landedPreview,
  isForeignCurrency,
  convertedPreview,
  needsFxRate,
  canConfirmDoc,
  buildPrecommitSummary,
  summarySentence,
  type ReviewLine,
  type ReviewDoc,
} from "@/app/(app)/setup/expendables/ingest/ingest-review-model";

// Plan 072 Unit 8 — pure review view-model. The UI itself is manual browser QA (no jsdom/RTL in this repo);
// these lock the money-adjacent view logic: landed preview parity with the allocator, the Confirm gate, the
// foreign-currency flag, and the pre-commit blast-radius summary.

function line(over: Partial<ReviewLine> = {}): ReviewLine {
  return {
    id: over.id ?? "l1",
    lineNo: over.lineNo ?? 1,
    descriptionRaw: over.descriptionRaw ?? "Widget",
    vendorItemCodeRaw: over.vendorItemCodeRaw ?? null,
    qty: over.qty ?? null,
    // Default to a valid pack size so tests not about the pack gate stay green; override with null to test it.
    unitRaw: "unitRaw" in over ? (over.unitRaw ?? null) : "1 kg",
    unitPrice: over.unitPrice ?? null,
    lineTotal: over.lineTotal ?? null,
    lotNoRaw: over.lotNoRaw ?? null,
    matchDecision: over.matchDecision ?? null,
    matchedMaterialId: over.matchedMaterialId ?? null,
    resolvedKind: over.resolvedKind ?? null,
    resolvedCategory: over.resolvedCategory ?? null,
    allocatedUnitCost: over.allocatedUnitCost ?? null,
    createdSupplyLotId: over.createdSupplyLotId ?? null,
  };
}

function doc(over: Partial<ReviewDoc> = {}): ReviewDoc {
  return {
    id: over.id ?? "d1",
    batchId: over.batchId ?? "b1",
    fileName: over.fileName ?? "invoice.pdf",
    mimeType: over.mimeType ?? "application/pdf",
    docType: over.docType ?? "invoice",
    status: over.status ?? "pending",
    currency: over.currency ?? "USD",
    vendorNameRaw: over.vendorNameRaw ?? "Scott Labs",
    vendorInvoiceNumber: over.vendorInvoiceNumber ?? "SIV535475",
    invoiceTotal: over.invoiceTotal ?? null,
    taxTotal: over.taxTotal ?? null,
    landedReceipt: over.landedReceipt ?? null,
    // Plan 076: default to a chosen status so tests not about the payment gate stay green.
    paymentStatus: "paymentStatus" in over ? (over.paymentStatus ?? null) : "OUTSTANDING",
    paidFromAccount: over.paidFromAccount ?? null,
    charges: over.charges ?? null,
    warnings: over.warnings ?? [],
    coaLotNo: over.coaLotNo ?? null,
    lines: over.lines ?? [],
  };
}

describe("isReceiptDoc", () => {
  it("invoice + proforma are receipts; coa/other are not", () => {
    expect(isReceiptDoc("invoice")).toBe(true);
    expect(isReceiptDoc("proforma")).toBe(true);
    expect(isReceiptDoc("coa")).toBe(false);
    expect(isReceiptDoc("other")).toBe(false);
  });
});

describe("effectiveDecision / lineSubtotal", () => {
  it("undecided defaults to new", () => {
    expect(effectiveDecision(line({ matchDecision: null }))).toBe("new");
    expect(effectiveDecision(line({ matchDecision: "existing" }))).toBe("existing");
  });
  it("subtotal prefers explicit lineTotal, else qty × unitPrice, else null", () => {
    expect(lineSubtotal(line({ lineTotal: 100 }))).toBe(100);
    expect(lineSubtotal(line({ qty: 4, unitPrice: 25 }))).toBe(100);
    expect(lineSubtotal(line({ qty: 4 }))).toBeNull();
    expect(lineSubtotal(line({}))).toBeNull();
  });
});

describe("landedPreview", () => {
  it("spreads shipping proportionally by subtotal and matches the allocator", () => {
    // Two priced lines 300 + 100 = 400 goods; $40 shipping → 30 / 10 split.
    const d = doc({
      charges: { shipping: 40 },
      lines: [line({ lineNo: 1, lineTotal: 300 }), line({ lineNo: 2, lineTotal: 100 })],
    });
    expect(landedPreview(d)).toEqual([330, 110]);
  });
  it("skipped lines absorb no charge and preview null", () => {
    const d = doc({
      charges: { shipping: 40 },
      lines: [line({ lineNo: 1, lineTotal: 300, matchDecision: "skip" }), line({ lineNo: 2, lineTotal: 100 })],
    });
    // All $40 lands on the single non-skip line; the skipped line is null.
    expect(landedPreview(d)).toEqual([null, 140]);
  });
  it("unknown-price line stays null (D14 — never a fabricated $0)", () => {
    const d = doc({ charges: null, lines: [line({ lineNo: 1 })] });
    expect(landedPreview(d)).toEqual([null]);
  });
});

describe("isForeignCurrency", () => {
  it("flags a doc currency different from base; case/space-insensitive", () => {
    expect(isForeignCurrency("EUR", "USD")).toBe(true);
    expect(isForeignCurrency("usd", "USD")).toBe(false);
    expect(isForeignCurrency("USD", null)).toBe(false);
    expect(isForeignCurrency(null, "USD")).toBe(false);
  });
});

describe("canConfirmDoc", () => {
  it("blocks a non-receipt", () => {
    const g = canConfirmDoc(doc({ docType: "coa", lines: [line()] }));
    expect(g.ok).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/reclassify/i);
  });
  it("blocks a proforma until landed-receipt is answered Yes", () => {
    expect(canConfirmDoc(doc({ docType: "proforma", landedReceipt: null, lines: [line()] })).ok).toBe(false);
    expect(canConfirmDoc(doc({ docType: "proforma", landedReceipt: false, lines: [line()] })).ok).toBe(false);
    expect(canConfirmDoc(doc({ docType: "proforma", landedReceipt: true, lines: [line()] })).ok).toBe(true);
  });
  it("blocks when all lines are skipped", () => {
    const g = canConfirmDoc(doc({ lines: [line({ matchDecision: "skip" })] }));
    expect(g.ok).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/skipped/i);
  });
  it("blocks an 'existing' line with no chosen material", () => {
    const g = canConfirmDoc(doc({ lines: [line({ lineNo: 2, matchDecision: "existing", matchedMaterialId: null })] }));
    expect(g.ok).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/Line 2/);
  });
  it("passes a clean invoice", () => {
    expect(canConfirmDoc(doc({ lines: [line({ lineTotal: 100 })] })).ok).toBe(true);
  });
  it("blocks an already-applied doc", () => {
    expect(canConfirmDoc(doc({ status: "applied", lines: [line()] })).ok).toBe(false);
  });
  it("blocks a receipt line with no/ambiguous pack size (the accounting-accuracy gate)", () => {
    // The exact Crush2Cellar bug: extraction gave "Each" → must not confirm until amount+unit are set.
    expect(canConfirmDoc(doc({ lines: [line({ unitRaw: "Each" })] })).ok).toBe(false);
    expect(canConfirmDoc(doc({ lines: [line({ unitRaw: null })] })).ok).toBe(false);
    expect(canConfirmDoc(doc({ lines: [line({ unitRaw: "kg" })] })).ok).toBe(false); // unit but no amount
    expect(canConfirmDoc(doc({ lines: [line({ unitRaw: "250 g" })] })).ok).toBe(true); // amount + unit → ok
    // a skipped line with a bad pack size does NOT block (it's not intaken)
    expect(canConfirmDoc(doc({ lines: [line({ unitRaw: "Each", matchDecision: "skip" }), line({ lineNo: 2, unitRaw: "1 kg" })] })).ok).toBe(true);
  });
  it("Plan 076: blocks until a payment status is chosen", () => {
    const g = canConfirmDoc(doc({ paymentStatus: null, lines: [line()] }));
    expect(g.ok).toBe(false);
    expect(g.reasons.some((r) => /Paid or still Outstanding/.test(r))).toBe(true);
  });
  it("Plan 076: a Paid invoice needs a pay-from account", () => {
    expect(canConfirmDoc(doc({ paymentStatus: "PAID", paidFromAccount: null, lines: [line()] })).ok).toBe(false);
    expect(canConfirmDoc(doc({ paymentStatus: "PAID", paidFromAccount: "1010-Checking", lines: [line()] })).ok).toBe(true);
    expect(canConfirmDoc(doc({ paymentStatus: "OUTSTANDING", lines: [line()] })).ok).toBe(true);
  });
});

describe("pack size (amount + unit) helpers", () => {
  it("parsePackFields splits amount + unit strictly (bare count word → amount null)", async () => {
    const { parsePackFields, packFieldsValid, packInputValues, composePackUnitRaw } = await import("@/app/(app)/setup/expendables/ingest/ingest-review-model");
    expect(parsePackFields("250 g")).toEqual({ amount: 250, unit: "g" });
    expect(parsePackFields("1 kg")).toEqual({ amount: 1, unit: "kg" });
    expect(parsePackFields("Each")).toEqual({ amount: null, unit: "each" });
    expect(parsePackFields(null)).toEqual({ amount: null, unit: "" });

    expect(packFieldsValid("250 g")).toBe(true);
    expect(packFieldsValid("2 mL")).toBe(true);
    expect(packFieldsValid("Each")).toBe(false);
    expect(packFieldsValid("kg")).toBe(false);
    expect(packFieldsValid("0 g")).toBe(false);
    expect(packFieldsValid("5 widgets")).toBe(false); // unrecognized unit

    // prefill: a recognized unit shows; an ambiguous "Each" shows BLANK (must be chosen)
    expect(packInputValues("250 g")).toEqual({ amount: "250", unit: "g" });
    expect(packInputValues("Each")).toEqual({ amount: "", unit: "" });

    expect(composePackUnitRaw("250", "g")).toBe("250 g");
    expect(composePackUnitRaw("", "")).toBeNull();
    expect(composePackUnitRaw("1", "kg")).toBe("1 kg");
  });
});

describe("buildPrecommitSummary", () => {
  it("counts new / restock / skip / A/P and totals landed + tax", () => {
    const d = doc({
      taxTotal: 10,
      charges: { shipping: 40 },
      vendorNameRaw: "Scott Labs",
      lines: [
        line({ lineNo: 1, lineTotal: 300, matchDecision: "new" }),
        line({ lineNo: 2, lineTotal: 100, matchDecision: "existing", matchedMaterialId: "m1" }),
        line({ lineNo: 3, matchDecision: "skip" }),
      ],
    });
    const s = buildPrecommitSummary(d, { vendorExisting: false });
    expect(s.newCount).toBe(1);
    expect(s.restockCount).toBe(1);
    expect(s.skipCount).toBe(1);
    expect(s.apCount).toBe(2);
    // 330 + 110 landed + 10 tax = 450
    expect(s.total).toBe(450);
    expect(s.vendorAction).toBe("create");
    expect(s.hasUnknownPrice).toBe(false);
  });
  it("marks unknown price and a null total when nothing is priced", () => {
    const s = buildPrecommitSummary(doc({ lines: [line({ lineNo: 1 })] }), { vendorExisting: true });
    expect(s.hasUnknownPrice).toBe(true);
    expect(s.total).toBeNull();
    expect(s.apCount).toBe(0);
    expect(s.vendorAction).toBe("existing");
  });
  it("no vendor name → vendorAction none", () => {
    const s = buildPrecommitSummary(doc({ vendorNameRaw: "  ", lines: [line({ lineTotal: 5 })] }), { vendorExisting: false });
    expect(s.vendorAction).toBe("none");
  });
  it("summarySentence renders the blast radius", () => {
    const s = buildPrecommitSummary(
      doc({ charges: { shipping: 40 }, taxTotal: 10, lines: [line({ lineNo: 1, lineTotal: 300 }), line({ lineNo: 2, lineTotal: 100, matchDecision: "existing", matchedMaterialId: "m1" })] }),
      { vendorExisting: false },
    );
    const text = summarySentence(s);
    expect(text).toMatch(/Create vendor Scott Labs/);
    expect(text).toMatch(/1 new material/);
    expect(text).toMatch(/1 restock/);
    expect(text).toMatch(/2 A\/P bills/);
    expect(text).toMatch(/total 450.00 USD/);
  });
});

// Plan 073: the review-screen FX helpers — converted preview + the fail-loud rate gate.
describe("convertedPreview (Plan 073)", () => {
  const eurDoc = doc({
    currency: "EUR",
    lines: [line({ id: "a", lineNo: 1, qty: 10, unitPrice: 11, lineTotal: 110 })],
  });
  it("converts a foreign doc's landed preview to base at the rate (round2)", () => {
    // €110 × 1.25 = 137.50 base
    expect(convertedPreview(eurDoc, "USD", 1.25)).toEqual([137.5]);
  });
  it("returns the un-converted (foreign) preview when the rate is missing", () => {
    expect(convertedPreview(eurDoc, "USD", null)).toEqual([110]);
  });
  it("a base-currency doc is never converted (rate ignored)", () => {
    const usd = doc({ currency: "USD", lines: [line({ qty: 10, unitPrice: 11, lineTotal: 110 })] });
    expect(convertedPreview(usd, "USD", 1.25)).toEqual([110]);
  });
});

describe("needsFxRate + canConfirmDoc FX gate (Plan 073)", () => {
  it("a foreign doc with no rate needs one; with a positive rate it doesn't", () => {
    expect(needsFxRate("EUR", "USD", null)).toBe(true);
    expect(needsFxRate("EUR", "USD", 0)).toBe(true);
    expect(needsFxRate("EUR", "USD", 1.1)).toBe(false);
    expect(needsFxRate("USD", "USD", null)).toBe(false); // base doc never needs a rate
  });

  it("Confirm is BLOCKED for a foreign doc with no rate, and cleared once a rate is supplied", () => {
    const eur = doc({ currency: "EUR", lines: [line({ qty: 1, unitPrice: 10, lineTotal: 10 })] });
    const blocked = canConfirmDoc(eur, { baseCurrency: "USD", rate: null });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons.some((r) => /exchange rate/i.test(r))).toBe(true);
    const okGate = canConfirmDoc(eur, { baseCurrency: "USD", rate: 1.1 });
    expect(okGate.ok).toBe(true);
  });

  it("without the fx arg the gate is unchanged (base-currency callers unaffected)", () => {
    const usd = doc({ currency: "USD", lines: [line({ qty: 1, unitPrice: 10, lineTotal: 10 })] });
    expect(canConfirmDoc(usd).ok).toBe(true);
  });
});
