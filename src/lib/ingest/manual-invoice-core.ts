import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { coerceCurrency } from "@/lib/money/currency";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createIngestedInvoiceCore, type CreateIngestedResult, type IngestDocumentInput } from "@/lib/ingest/ingest-invoice-core";
import type { ExtractedDocument, ExtractedLine } from "@/lib/ingest/extract-invoice";

// Plan 080 U4 — MANUAL invoice entry. Types an invoice in by hand and stages it as a synthetic
// `IngestedInvoice` + lines, so it lands on the SAME review screen and applies through the SAME
// `applyIngestedInvoiceCore` as an AI-extracted upload. That reuse is the whole point:
//   • ONE aggregate `emitApExportForInvoice` per invoice (AP-1) — hand-rolling A/P here would risk N per-line
//     bills, the exact violation the plan calls out;
//   • landed-cost allocation, UOM normalization, the duplicate guard, the reconciliation/`needsAck` gates and
//     FX resolution (COST-4) all come for free and stay identical between the two paths.
// There is NO new A/P code in this file, and no schema change — the human-only fields (destination location,
// invoice date) ride in `extractedJson` via the optional `ExtractedDocument` fields added in U4.
//
// WAVE-1 SCOPE (council C6): MATERIALS ONLY. `targetKind` branching (equipment assets / finished goods) is
// Unit 5 / Wave 3; until it lands this core hard-refuses any non-MATERIAL line rather than silently
// misposting it as a consumable.

/** Sentinel blob for a fileless manual entry. The document-preview route recognises it and 404s cleanly. */
export const MANUAL_INVOICE_BLOB_URL = "manual://no-source-document";
export const MANUAL_INVOICE_MIME = "application/vnd.cellarhand.manual-invoice";

export type ManualInvoiceLineInput = {
  description: string;
  qty?: number | null;
  /** invoice UOM as written ("25 kg", "case", "L") — normalized to the material's stock unit at apply. */
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  vendorItemCode?: string | null;
  lotNo?: string | null;
  /** Wave-3 seam. Only MATERIAL is accepted in Wave 1 (council C6). */
  targetKind?: "MATERIAL" | "EQUIPMENT_ASSET" | "FINISHED_GOOD" | null;
};

export type ManualInvoiceInput = {
  vendorName: string;
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  /** invoice currency; a foreign one is converted to base at apply against ONE dated rate (COST-4). */
  currency?: string | null;
  /** the supplier's grand total — the reconciliation-gate target. Omit to skip the gate. */
  invoiceTotal?: number | null;
  /** REQUIRED: every intake lands somewhere physical (plan 080 requirement). */
  locationId: string;
  charges?: { shipping?: number | null; handling?: number | null; surcharge?: number | null; tax?: number | null } | null;
  lines: ManualInvoiceLineInput[];
  notes?: string | null;
};

/** A finite, non-negative money/qty figure, else null (unknown — D14/COST-2, never a fabricated $0). */
function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v >= 0 ? v : null;
}

export type BuiltManualInvoice = { document: ExtractedDocument; fileName: string };

/**
 * PURE: validate a hand-typed invoice and shape it into exactly the `ExtractedDocument` the AI extractor
 * would have produced, so both paths are indistinguishable downstream. No DB, no I/O — unit-tested directly.
 */
export function buildManualInvoiceDocument(input: ManualInvoiceInput): BuiltManualInvoice {
  const vendorName = input.vendorName?.trim();
  if (!vendorName) throw new ActionError("Enter the vendor for this invoice.", "VALIDATION");

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const lines: ExtractedLine[] = [];
  for (const [i, l] of rawLines.entries()) {
    const description = l?.description?.trim();
    // A blank trailing row is normal in a spreadsheet-style form — drop it rather than failing the entry.
    if (!description) continue;

    // Council C6: refuse a non-material target instead of silently booking a pump as a consumable.
    if (l.targetKind && l.targetKind !== "MATERIAL") {
      throw new ActionError(
        `Line ${i + 1} ("${description}") is marked as ${l.targetKind === "EQUIPMENT_ASSET" ? "equipment" : "a finished good"}. ` +
          "Manual invoices can only bring in consumables/parts right now — enter equipment and finished goods separately.",
        "VALIDATION",
      );
    }
    if (l.qty != null && Number.isFinite(l.qty) && l.qty < 0) throw new ActionError(`Line ${i + 1} ("${description}"): quantity can't be negative.`, "VALIDATION");
    if (l.unitPrice != null && Number.isFinite(l.unitPrice) && l.unitPrice < 0) throw new ActionError(`Line ${i + 1} ("${description}"): unit price can't be negative.`, "VALIDATION");

    const qty = num(l.qty);
    const unitPrice = num(l.unitPrice);
    lines.push({
      description,
      vendorItemCode: l.vendorItemCode?.trim() || null,
      qty,
      unit: l.unit?.trim() || null,
      unitPrice,
      // Derive the extended total when the human gave qty × price but not the total — the charge-allocation
      // basis needs it. Left null when neither is known (UNKNOWN cost, never an invented 0).
      lineTotal: num(l.lineTotal) ?? (qty != null && unitPrice != null ? Math.round(qty * unitPrice * 1e8) / 1e8 : null),
      lotNo: l.lotNo?.trim() || null,
    });
  }
  if (lines.length === 0) throw new ActionError("Add at least one line to the invoice.", "VALIDATION");

  const charges = input.charges
    ? { shipping: num(input.charges.shipping), handling: num(input.charges.handling), surcharge: num(input.charges.surcharge), tax: num(input.charges.tax) }
    : null;

  const invoiceNumber = input.invoiceNumber?.trim() || null;
  const document: ExtractedDocument = {
    docType: "invoice",
    vendor: { name: vendorName },
    currency: input.currency?.trim() ? coerceCurrency(input.currency) : null,
    invoiceNumber,
    invoiceTotal: num(input.invoiceTotal),
    lines,
    charges,
    coa: null,
    warnings: [],
    notes: input.notes?.trim() || null,
    // human-only fields (no columns for these) — read back by the apply + the review screen
    locationId: input.locationId,
    invoiceDate: input.invoiceDate ? input.invoiceDate.toISOString() : null,
    manualEntry: true,
  };

  return { document, fileName: invoiceNumber ? `Manual entry — ${invoiceNumber}` : `Manual entry — ${vendorName}` };
}

export type CreateManualInvoiceResult = CreateIngestedResult & { batchId: string; invoiceId: string };

/**
 * Stage a hand-typed invoice for review. Validates + shapes it (above), checks the destination location, then
 * hands off to `createIngestedInvoiceCore` — the same staging core the uploader uses, so the duplicate guard
 * (same vendor + invoice number) fires for a re-typed invoice too. Nothing is booked here; the human confirms
 * on the review screen and `applyIngestedInvoiceCore` does the goods + the single aggregate bill.
 */
export async function createManualInvoiceCore(actor: LedgerActor, input: ManualInvoiceInput): Promise<CreateManualInvoiceResult> {
  const { document, fileName } = buildManualInvoiceDocument(input);

  const location = await prisma.location.findUnique({ where: { id: input.locationId }, select: { id: true, isActive: true } });
  if (!location || !location.isActive) throw new ActionError("Choose an active location for this delivery.", "VALIDATION");

  const batchId = crypto.randomUUID();
  const doc: IngestDocumentInput = {
    blobUrl: MANUAL_INVOICE_BLOB_URL,
    fileName,
    mimeType: MANUAL_INVOICE_MIME,
    // No file, so NO sha256 — otherwise every manual entry would collide on the file-hash duplicate guard.
    // The (vendor, invoice#) guard still applies, which is exactly what catches a re-typed invoice.
    fileSha256: null,
    document,
  };

  const staged = await createIngestedInvoiceCore(actor, { batchId, documents: [doc] });
  const invoiceId = staged.invoices[0]?.id;
  if (!invoiceId) throw new ActionError("Couldn't stage that invoice — try again.", "VALIDATION");
  return { ...staged, batchId, invoiceId };
}
