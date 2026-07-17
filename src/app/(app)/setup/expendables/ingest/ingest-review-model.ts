import { allocateLandedCost, type InvoiceCharges } from "@/lib/ingest/landed-cost";

// Plan 072 Unit 8 — PURE view-model for the invoice review screen. The repo has no jsdom/RTL, so ALL
// non-trivial review logic lives here (and is unit-tested in test/ingest-review-model.test.ts); the client
// component is a thin shell over these. NO prisma / React imports — client-safe + directly testable.
//
// Covers: the per-line landed-cost preview (reuses the Unit-5 allocator so the screen shows the SAME number
// the apply core will compute), the "can Confirm?" gate (proforma answered + every decision resolved),
// foreign-currency flagging, and the pre-commit blast-radius summary.

export type ReviewDecision = "new" | "existing" | "skip";

/** A staged invoice line as the review client edits it (Decimals already serialized to numbers by the loader). */
export type ReviewLine = {
  id: string;
  lineNo: number;
  descriptionRaw: string;
  vendorItemCodeRaw: string | null;
  qty: number | null;
  unitRaw: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  lotNoRaw: string | null;
  matchDecision: ReviewDecision | null;
  matchedMaterialId: string | null;
  resolvedKind: string | null;
  resolvedCategory: string | null;
  allocatedUnitCost: number | null;
  createdSupplyLotId: string | null;
};

export type ReviewDocType = "invoice" | "proforma" | "coa" | "other";
export type ReviewStatus = "pending" | "applying" | "applied" | "discarded" | "held";

/** A staged document (one source file) as the review client sees it. */
export type ReviewDoc = {
  id: string;
  batchId: string;
  fileName: string;
  mimeType: string;
  docType: ReviewDocType;
  status: ReviewStatus;
  currency: string | null;
  vendorNameRaw: string | null;
  vendorInvoiceNumber: string | null;
  invoiceTotal: number | null;
  taxTotal: number | null;
  landedReceipt: boolean | null;
  /** Charges + warnings pulled out of the stored extractedJson by the loader. */
  charges: InvoiceCharges | null;
  warnings: string[];
  coaLotNo: string | null;
  lines: ReviewLine[];
};

/** A receipt is the only kind that intakes stock. COA / other are supporting docs. */
export function isReceiptDoc(docType: ReviewDocType): boolean {
  return docType === "invoice" || docType === "proforma";
}

/** The effective dedup decision for a line (undecided defaults to "new", mirroring the apply core). */
export function effectiveDecision(line: Pick<ReviewLine, "matchDecision">): ReviewDecision {
  return line.matchDecision ?? "new";
}

/** The line's goods value (subtotal): the extracted line total, else qty × unit price, else unknown (null). */
export function lineSubtotal(line: Pick<ReviewLine, "qty" | "unitPrice" | "lineTotal">): number | null {
  if (line.lineTotal != null && Number.isFinite(line.lineTotal)) return line.lineTotal;
  if (line.qty != null && line.unitPrice != null && Number.isFinite(line.qty) && Number.isFinite(line.unitPrice)) {
    return line.qty * line.unitPrice;
  }
  return null;
}

/**
 * Per-line landed-line-total preview, in the SAME order as `doc.lines`. Skipped lines contribute nothing
 * (their subtotal is treated as unknown so charges spread only across the intaken lines) and get a null
 * preview. This mirrors the apply core, which allocates over the non-skip lines only.
 */
export function landedPreview(doc: Pick<ReviewDoc, "lines" | "charges">): (number | null)[] {
  const subtotals = doc.lines.map((l) => (effectiveDecision(l) === "skip" ? null : lineSubtotal(l)));
  const allocation = allocateLandedCost(subtotals, doc.charges ?? null);
  return allocation.map((a) => a.landedLineTotal);
}

/** Is this line billed in a currency different from the winery's base currency? (No FX — just a flag.) */
export function isForeignCurrency(docCurrency: string | null, baseCurrency: string | null): boolean {
  if (!docCurrency || !baseCurrency) return false;
  return docCurrency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase();
}

export type ConfirmGate = { ok: boolean; reasons: string[] };

/**
 * May this document be Confirmed (applied)? Enforces, in order: it must be a receipt; a proforma must be
 * marked as a landed receipt (the un-pre-checked gate); there must be at least one non-skip line; and every
 * "add to existing" line must have actually chosen a material. Returns the blocking reasons for the UI.
 */
export function canConfirmDoc(doc: Pick<ReviewDoc, "docType" | "landedReceipt" | "lines" | "status">): ConfirmGate {
  const reasons: string[] = [];
  if (doc.status === "applied") return { ok: false, reasons: ["This invoice has already been applied."] };
  if (doc.status === "applying") return { ok: false, reasons: ["This invoice is being applied."] };
  if (!isReceiptDoc(doc.docType)) {
    reasons.push("Only an invoice (or a landed proforma) can be applied — reclassify it as an invoice to intake it.");
    return { ok: false, reasons };
  }
  if (doc.docType === "proforma" && doc.landedReceipt !== true) {
    reasons.push("Answer the landed-receipt question — Yes means the goods were physically received in full.");
  }
  const active = doc.lines.filter((l) => effectiveDecision(l) !== "skip");
  if (active.length === 0) {
    reasons.push("Every line is skipped — nothing to intake.");
  }
  for (const l of active) {
    if (effectiveDecision(l) === "existing" && !l.matchedMaterialId) {
      reasons.push(`Line ${l.lineNo} is set to "add to existing" but no material is chosen.`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export type PrecommitSummary = {
  vendorAction: "create" | "existing" | "none";
  vendorName: string | null;
  newCount: number;
  restockCount: number;
  skipCount: number;
  apCount: number;
  total: number | null;
  currency: string | null;
  hasUnknownPrice: boolean;
};

/**
 * The blast radius shown before Confirm: how many new materials, restocks, skips, A/P bills, and the total
 * payable (Σ landed line totals + tax). `vendorExisting` is supplied by the caller (it resolves the vendor
 * name against the catalog); a blank vendor name → "none".
 */
export function buildPrecommitSummary(
  doc: Pick<ReviewDoc, "lines" | "charges" | "taxTotal" | "currency" | "vendorNameRaw">,
  opts: { vendorExisting: boolean },
): PrecommitSummary {
  let newCount = 0;
  let restockCount = 0;
  let skipCount = 0;
  let apCount = 0;
  const preview = landedPreview(doc);
  let landedSum = 0;
  let sawKnown = false;
  let hasUnknownPrice = false;

  doc.lines.forEach((l, i) => {
    const decision = effectiveDecision(l);
    if (decision === "skip") {
      skipCount++;
      return;
    }
    if (decision === "existing") restockCount++;
    else newCount++;
    const landed = preview[i];
    if (landed == null) hasUnknownPrice = true;
    else {
      landedSum += landed;
      sawKnown = true;
      apCount++; // a known-cost line emits an A/P bill
    }
  });

  const tax = doc.taxTotal != null && Number.isFinite(doc.taxTotal) ? doc.taxTotal : 0;
  const total = sawKnown ? Math.round((landedSum + tax) * 100) / 100 : null;

  const vendorName = doc.vendorNameRaw?.trim() || null;
  const vendorAction: PrecommitSummary["vendorAction"] = !vendorName ? "none" : opts.vendorExisting ? "existing" : "create";

  return { vendorAction, vendorName, newCount, restockCount, skipCount, apCount, total, currency: doc.currency ?? null, hasUnknownPrice };
}

/** Render the pre-commit summary as a single human sentence for the review screen. */
export function summarySentence(s: PrecommitSummary): string {
  const parts: string[] = [];
  if (s.vendorAction === "create") parts.push(`Create vendor ${s.vendorName}`);
  else if (s.vendorAction === "existing") parts.push(`Vendor ${s.vendorName}`);
  if (s.newCount > 0) parts.push(`${s.newCount} new material${s.newCount === 1 ? "" : "s"}`);
  if (s.restockCount > 0) parts.push(`${s.restockCount} restock${s.restockCount === 1 ? "" : "s"}`);
  if (s.skipCount > 0) parts.push(`${s.skipCount} skipped`);
  parts.push(`${s.apCount} A/P bill${s.apCount === 1 ? "" : "s"}`);
  const totalStr = s.total == null ? "unknown total" : `total ${s.total.toFixed(2)}${s.currency ? ` ${s.currency}` : ""}`;
  parts.push(totalStr);
  return parts.join(" · ");
}
