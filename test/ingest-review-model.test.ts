import { describe, it, expect } from "vitest";
import {
  isReceiptDoc,
  effectiveDecision,
  lineSubtotal,
  landedPreview,
  isForeignCurrency,
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
    unitRaw: over.unitRaw ?? null,
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
