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
  // Plan 080 U5 — where this line's goods go. A mixed invoice is classified HERE, before apply.
  targetKind: "MATERIAL" | "EQUIPMENT_ASSET" | "FINISHED_GOOD" | null;
  wineSkuTargetId: string | null;
  finishedGoodTargetId: string | null;
};

/** The three destinations a line can route to, with the wording the receiving desk actually uses. */
export const LINE_TARGETS: { value: "MATERIAL" | "EQUIPMENT_ASSET" | "FINISHED_GOOD"; label: string }[] = [
  { value: "MATERIAL", label: "Consumable / part" },
  { value: "EQUIPMENT_ASSET", label: "Equipment (asset)" },
  { value: "FINISHED_GOOD", label: "Finished goods" },
];

export type ReviewDocType = "invoice" | "proforma" | "coa" | "other";
export type ReviewStatus = "pending" | "applying" | "applied" | "discarded" | "held";
/** Plan 076: mirrors the ApPaymentStatus enum (kept as a local literal — this module stays prisma-free). */
export type PaymentStatus = "OUTSTANDING" | "PAID";

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
  /** Plan 076: the A/P payment status the human must pick before Confirm, + the pay-from account when Paid. */
  paymentStatus: PaymentStatus | null;
  paidFromAccount: string | null;
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

// ── pack size (amount + unit) — the accounting-accuracy fix ──
// A line's `unitRaw` is a single "amount unit" string ("250 g", "1 kg") the apply core normalizes. Extraction
// often gives an ambiguous bare "Each", which silently became "1 unit" — wrong stock + cost. The review screen
// now captures an explicit Amount + a Unit dropdown, and Confirm is BLOCKED until BOTH are set for every
// receipt line, so pack size is never guessed.

export const PACK_UNITS = ["g", "kg", "mg", "oz", "lb", "ton", "mL", "L", "gal", "fl oz", "unit"] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

/** Strict split of a `unitRaw` string into a pack amount + unit. Does NOT collapse "Each"/"ea" into a unit —
 *  a bare count word yields {amount:null} so it fails validation and forces the human to enter a real size. */
export function parsePackFields(unitRaw: string | null | undefined): { amount: number | null; unit: string } {
  const s = String(unitRaw ?? "").trim();
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
  if (!m) return { amount: null, unit: s.toLowerCase() };
  const amount = Number(m[1]);
  return { amount: Number.isFinite(amount) ? amount : null, unit: m[2].trim().toLowerCase() };
}

/** Match a parsed unit to a recognized pack unit (case-insensitive) — a built-in PACK_UNITS value OR one of the
 *  tenant's custom unit names (plan 075). Returns the canonical/original spelling to prefill the dropdown, or null. */
export function canonicalPackUnit(unit: string | null | undefined, extraUnitNames: readonly string[] = []): string | null {
  const u = String(unit ?? "").trim().toLowerCase();
  const builtin = (PACK_UNITS as readonly string[]).find((p) => p.toLowerCase() === u);
  if (builtin) return builtin;
  return extraUnitNames.find((n) => n.trim().toLowerCase() === u) ?? null;
}

/** Is a line's pack size fully specified (amount > 0 AND a recognized unit)? The Confirm gate for a receipt.
 *  A custom unit name (plan 075) counts as recognized when passed in `extraUnitNames`. */
export function packFieldsValid(unitRaw: string | null | undefined, extraUnitNames: readonly string[] = []): boolean {
  const { amount, unit } = parsePackFields(unitRaw);
  return amount != null && amount > 0 && canonicalPackUnit(unit, extraUnitNames) != null;
}

/** Compose the stored `unitRaw` from the review screen's separate Amount + Unit inputs. Blank when neither. */
export function composePackUnitRaw(amount: string | number | null | undefined, unit: string | null | undefined): string | null {
  const a = amount == null ? "" : String(amount).trim();
  const u = String(unit ?? "").trim();
  return [a, u].filter(Boolean).join(" ") || null;
}

/** The Amount + Unit to PREFILL the two inputs from a stored `unitRaw` — but only prefill the unit when it's a
 *  recognized pack unit, so an ambiguous "Each" shows blank and must be chosen (never silently accepted). */
export function packInputValues(unitRaw: string | null | undefined, extraUnitNames: readonly string[] = []): { amount: string; unit: string } {
  const { amount, unit } = parsePackFields(unitRaw);
  const canonical = canonicalPackUnit(unit, extraUnitNames);
  return { amount: amount != null ? String(amount) : "", unit: canonical ?? "" };
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

/** Is this line billed in a currency different from the winery's base currency? */
export function isForeignCurrency(docCurrency: string | null, baseCurrency: string | null): boolean {
  if (!docCurrency || !baseCurrency) return false;
  return docCurrency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase();
}

/**
 * Plan 073: the per-line landed preview CONVERTED to the base currency at `rate` (base per 1 foreign), in
 * doc order. For a base-currency doc (or a null rate) this is the un-converted preview — the screen shows the
 * foreign figure until a rate is entered. `rate` mirrors the apply core's money grain (round2 cents).
 */
export function convertedPreview(
  doc: Pick<ReviewDoc, "lines" | "charges" | "currency">,
  baseCurrency: string | null,
  rate: number | null,
): (number | null)[] {
  const foreign = landedPreview(doc);
  if (!isForeignCurrency(doc.currency ?? null, baseCurrency) || rate == null || !(rate > 0)) return foreign;
  return foreign.map((f) => (f == null ? null : Math.round(f * rate * 100) / 100));
}

/**
 * Plan 073: does this doc need an exchange rate the review screen hasn't got? True when the doc is in a
 * foreign currency AND no usable rate (feed-suggested or manual override) is available. This is the fail-loud
 * gate — a foreign invoice can't be applied without a rate (D14), never at a fabricated 1.0.
 */
export function needsFxRate(docCurrency: string | null, baseCurrency: string | null, rate: number | null): boolean {
  return isForeignCurrency(docCurrency, baseCurrency) && !(rate != null && Number.isFinite(rate) && rate > 0);
}

export type ConfirmGate = { ok: boolean; reasons: string[] };

/**
 * May this document be Confirmed (applied)? Enforces, in order: it must be a receipt; a proforma must be
 * marked as a landed receipt (the un-pre-checked gate); there must be at least one non-skip line; and every
 * "add to existing" line must have actually chosen a material. Returns the blocking reasons for the UI.
 */
export function canConfirmDoc(
  doc: Pick<ReviewDoc, "docType" | "landedReceipt" | "lines" | "status" | "currency" | "paymentStatus" | "paidFromAccount">,
  fx?: { baseCurrency: string | null; rate: number | null },
  extraUnitNames: readonly string[] = [],
): ConfirmGate {
  const reasons: string[] = [];
  if (doc.status === "applied") return { ok: false, reasons: ["This invoice has already been applied."] };
  if (doc.status === "applying") return { ok: false, reasons: ["This invoice is being applied."] };
  if (!isReceiptDoc(doc.docType)) {
    reasons.push("Only an invoice (or a landed proforma) can be applied — reclassify it as an invoice to intake it.");
    return { ok: false, reasons };
  }
  // Plan 076: the human must record whether this invoice is already Paid or still Outstanding (it syncs to
  // QuickBooks' A/P). A Paid invoice also needs the account the money came from (drives the QBO BillPayment).
  if (!doc.paymentStatus) {
    reasons.push("Choose whether this invoice is Paid or still Outstanding.");
  } else if (doc.paymentStatus === "PAID" && !doc.paidFromAccount?.trim()) {
    reasons.push("Choose which account paid it — a Paid invoice records a bill payment in QuickBooks.");
  }
  // Plan 073: a foreign-currency receipt with no usable rate can't be applied — the money would be wrong (D14).
  if (fx && needsFxRate(doc.currency ?? null, fx.baseCurrency, fx.rate)) {
    reasons.push("Enter the exchange rate — the FX feed had none for this invoice's date.");
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
    // Accounting-accuracy gate: every intaken line needs an explicit pack amount + unit (e.g. 250 g, 1 kg) so
    // stock quantity and per-unit cost are correct — never a guessed "1 unit".
    if (!packFieldsValid(l.unitRaw, extraUnitNames)) {
      reasons.push(`Line ${l.lineNo} needs a pack amount and unit (e.g. 250 g, 1 kg) so stock + cost are accurate.`);
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
