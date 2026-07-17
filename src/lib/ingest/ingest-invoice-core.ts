import type { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createStockMaterialCore, receiveSupplyCore } from "@/lib/cellar/materials";
import { findOrCreateVendorCore } from "@/lib/vendors/vendors";
import { allocateLandedCost, type InvoiceCharges } from "@/lib/ingest/landed-cost";
import { normalizeLineToStock, parsePackagingUnit } from "@/lib/ingest/normalize-line";
import { coerceStockUnit } from "@/lib/cellar/materials-shared";
import { coerceFamily, coerceMaterialCategory } from "@/lib/cellar/material-taxonomy";
import { dimensionOf, canonicalUnitFor } from "@/lib/units/measure";
import type { ExtractedDocument } from "@/lib/ingest/extract-invoice";

// Plan 072 Unit 7 (GOVERNED MONEY): persist extracted invoices as editable STAGING, then apply ONE invoice
// through the existing cores atomically. This file is the ai-native anchor (Unit 9 imports it). Nothing here
// touches the ledger directly — every write goes through createStockMaterialCore / receiveSupplyCore /
// findOrCreateVendorCore so costing, A/P emission, and tenant/RLS invariants stay intact.
//
// Atomicity (council P1): the apply opens ONE interactive tx and INJECTS it into the cores, so all lines +
// vendor + A/P commit or roll back together — true all-or-nothing. The old resumable per-line marker was
// unsound (marker written outside the core tx → duplicate lot+A/P on a crash). `createdSupplyLotId` remains
// only as an audit field. Actions RETURN { ok:false, error } — never throw an ActionError (prod redaction).

type Tx = Prisma.TransactionClient;

export type IngestDocumentInput = {
  blobUrl: string;
  fileName: string;
  mimeType: string;
  fileSha256?: string | null;
  document: ExtractedDocument;
};

export type CreateIngestedResult = {
  invoices: { id: string; fileName: string; docType: string }[];
  warnings: string[];
};

// ── create staging ──

/**
 * Persist a pile of extracted documents as `IngestedInvoice` (+ receipt lines for invoice/proforma) in
 * status `pending`. COA/other docs are stored for provenance but get NO receipt lines. Surfaces a soft
 * duplicate warning on a matching (vendor, invoice#) or fileSha256 (the human decides).
 */
export async function createIngestedInvoiceCore(
  actor: LedgerActor,
  input: { batchId: string; documents: IngestDocumentInput[] },
): Promise<CreateIngestedResult> {
  return runInTenantTx(async (tx) => {
    const invoices: CreateIngestedResult["invoices"] = [];
    const warnings: string[] = [];

    for (const d of input.documents) {
      const doc = d.document;
      const isReceipt = doc.docType === "invoice" || doc.docType === "proforma";

      // Soft duplicate guard (council): same (vendorName, invoice#) or same exact file already staged/applied.
      if (doc.invoiceNumber && doc.vendor?.name) {
        const dup = await tx.ingestedInvoice.findFirst({
          where: { vendorNameRaw: doc.vendor.name, vendorInvoiceNumber: doc.invoiceNumber, status: { in: ["pending", "applying", "applied"] } },
          select: { id: true },
        });
        if (dup) warnings.push(`"${d.fileName}": an invoice ${doc.invoiceNumber} from ${doc.vendor.name} is already in the queue — possible duplicate.`);
      }
      if (d.fileSha256) {
        const dupFile = await tx.ingestedInvoice.findFirst({ where: { fileSha256: d.fileSha256 }, select: { id: true } });
        if (dupFile) warnings.push(`"${d.fileName}": this exact file was uploaded before — possible duplicate.`);
      }

      const invoice = await tx.ingestedInvoice.create({
        data: {
          batchId: input.batchId,
          blobUrl: d.blobUrl,
          fileName: d.fileName,
          mimeType: d.mimeType,
          fileSha256: d.fileSha256 ?? null,
          docType: doc.docType,
          status: "pending",
          currency: doc.currency ?? null,
          vendorNameRaw: doc.vendor?.name ?? null,
          vendorInvoiceNumber: doc.invoiceNumber ?? null,
          invoiceTotal: doc.invoiceTotal ?? null,
          taxTotal: doc.charges?.tax ?? null,
          extractedJson: doc as unknown as Prisma.InputJsonValue,
          createdBy: actor.actorUserId ?? actor.actorEmail,
        },
        select: { id: true },
      });

      if (isReceipt) {
        for (let i = 0; i < doc.lines.length; i++) {
          const ln = doc.lines[i];
          await tx.ingestedInvoiceLine.create({
            data: {
              ingestedInvoiceId: invoice.id,
              lineNo: i + 1,
              descriptionRaw: ln.description || `Line ${i + 1}`,
              vendorItemCodeRaw: ln.vendorItemCode ?? null,
              qty: ln.qty ?? null,
              unitRaw: ln.unit ?? null,
              unitPrice: ln.unitPrice ?? null,
              lineTotal: ln.lineTotal ?? null,
              lotNoRaw: ln.lotNo ?? null,
            },
          });
        }
      }

      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "IngestedInvoice", entityId: invoice.id, summary: `Ingested "${d.fileName}" (${doc.docType})` });
      invoices.push({ id: invoice.id, fileName: d.fileName, docType: doc.docType });
    }

    return { invoices, warnings };
  });
}

// ── edit staging (human review) ──

export type LinePatch = Partial<{
  descriptionRaw: string;
  qty: number | null;
  unitRaw: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  lotNoRaw: string | null;
  matchDecision: "new" | "existing" | "skip";
  matchedMaterialId: string | null;
  resolvedKind: string | null;
  resolvedCategory: string | null;
}>;

/** Record a human edit + dedup/classification decision on one staged line. Tenant-scoped (RLS). */
export async function updateIngestedInvoiceLineCore(actor: LedgerActor, lineId: string, patch: LinePatch): Promise<void> {
  await runInTenantTx(async (tx) => {
    const existing = await tx.ingestedInvoiceLine.findUnique({ where: { id: lineId }, select: { id: true } });
    if (!existing) return; // RLS-filtered: another tenant's line is invisible → no-op
    await tx.ingestedInvoiceLine.update({ where: { id: lineId }, data: { ...patch } });
    void actor;
  });
}

export type InvoicePatch = Partial<{
  docType: "invoice" | "proforma" | "coa" | "other";
  landedReceipt: boolean | null;
  currency: string | null;
  vendorNameRaw: string | null;
  vendorInvoiceNumber: string | null;
  status: "pending" | "discarded" | "held";
}>;

/** Record header-level review edits: reclassify docType, answer the proforma gate, fix vendor/currency. */
export async function updateIngestedInvoiceCore(actor: LedgerActor, ingestedInvoiceId: string, patch: InvoicePatch): Promise<void> {
  await runInTenantTx(async (tx) => {
    const existing = await tx.ingestedInvoice.findUnique({ where: { id: ingestedInvoiceId }, select: { status: true } });
    if (!existing) return;
    if (existing.status === "applied" || existing.status === "applying") return; // can't edit an applied/in-flight invoice
    await tx.ingestedInvoice.update({ where: { id: ingestedInvoiceId }, data: { ...patch } });
    void actor;
  });
}

// ── apply (governed, atomic) ──

export type ApplyResult =
  | { ok: true; vendorId: string | null; supplyLotIds: string[]; apLineCount: number }
  | { ok: false; error: string; needsAck?: "reconcile" | "partial-ap" };

class ApplyAbort extends Error {
  constructor(public result: ApplyResult) {
    super("apply-abort");
  }
}

const RECON_EPS = 0.01;

/** Derive a sensible canonical stock unit for a NEW material from the invoice line's unit. */
function stockUnitForNewLine(unitRaw: string | null | undefined): string {
  const parsed = parsePackagingUnit(unitRaw);
  const dim = dimensionOf(parsed.unit);
  return dim ? canonicalUnitFor(dim) : coerceStockUnit(null); // count/unknown → the count default
}

/**
 * Apply ONE ingested invoice through the cores, atomically. Steps: concurrency claim (pending→applying) →
 * doc-type + proforma gate → recompute landed cost (allocate + UOM normalize) → reconciliation / partial-A/P
 * gate → per receipt line: resolve/create material, `receiveSupplyCore` (unified path, emits A/P uniformly),
 * backfill vendor-scoped item code (human-confirmed `existing` only) → COA expiry attach + provenance links →
 * mark applied. Any failure throws → the ONE tx rolls back (no partial lots/bills) and we return { ok:false }.
 */
export async function applyIngestedInvoiceCore(
  actor: LedgerActor,
  input: { ingestedInvoiceId: string; allowReconcileMismatch?: boolean; allowPartialAp?: boolean },
): Promise<ApplyResult> {
  try {
    return await runInTenantTx(async (tx) => {
      // (a) concurrency claim — compare-and-set pending→applying. A concurrent apply blocks on the row lock
      // then sees 0 rows (status changed) and is rejected. Rollback auto-reverts to pending.
      const claim = await tx.ingestedInvoice.updateMany({ where: { id: input.ingestedInvoiceId, status: "pending" }, data: { status: "applying" } });
      if (claim.count === 0) {
        throw new ApplyAbort({ ok: false, error: "This invoice is already being applied or has already been applied." });
      }

      const invoice = await tx.ingestedInvoice.findUnique({
        where: { id: input.ingestedInvoiceId },
        select: { id: true, docType: true, landedReceipt: true, currency: true, vendorNameRaw: true, vendorInvoiceNumber: true, invoiceTotal: true, taxTotal: true, extractedJson: true },
      });
      if (!invoice) throw new ApplyAbort({ ok: false, error: "Invoice not found." });

      // (b) doc-type + proforma gate
      if (invoice.docType !== "invoice" && invoice.docType !== "proforma") {
        throw new ApplyAbort({ ok: false, error: "Only an invoice (or a landed proforma) can be applied — this document isn't a receipt." });
      }
      if (invoice.docType === "proforma" && invoice.landedReceipt !== true) {
        throw new ApplyAbort({ ok: false, error: "This proforma isn't marked as a landed receipt. Confirm the goods were physically received in full before applying." });
      }

      const lines = await tx.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invoice.id }, orderBy: { lineNo: "asc" } });
      const receiptLines = lines.filter((l) => l.matchDecision !== "skip");
      if (receiptLines.length === 0) throw new ApplyAbort({ ok: false, error: "No receipt lines to apply (all skipped)." });

      // (c) recompute landed cost from the source of truth (never trust a stale client preview).
      const extracted = invoice.extractedJson as unknown as ExtractedDocument;
      const charges: InvoiceCharges = extracted?.charges ?? {};
      const subtotals = receiptLines.map((l) => {
        if (l.lineTotal != null) return Number(l.lineTotal);
        if (l.qty != null && l.unitPrice != null) return Number(l.qty) * Number(l.unitPrice);
        return null;
      });
      const allocation = allocateLandedCost(subtotals, charges);

      // (d) reconciliation + partial-A/P gate
      const tax = invoice.taxTotal != null ? Number(invoice.taxTotal) : 0;
      const knownLandedSum = allocation.reduce((a, x) => a + (x.landedLineTotal ?? 0), 0);
      const invoiceTotal = invoice.invoiceTotal != null ? Number(invoice.invoiceTotal) : null;
      if (invoiceTotal != null && Math.abs(knownLandedSum + tax - invoiceTotal) > RECON_EPS && !input.allowReconcileMismatch) {
        throw new ApplyAbort({
          ok: false,
          needsAck: "reconcile",
          error: `Line totals + tax (${(knownLandedSum + tax).toFixed(2)}) don't reconcile to the invoice total (${invoiceTotal.toFixed(2)}). Review the lines, or confirm an inventory-only apply.`,
        });
      }
      const hasUnknownCost = allocation.some((x) => x.landedLineTotal == null);
      if (hasUnknownCost && !input.allowPartialAp) {
        throw new ApplyAbort({ ok: false, needsAck: "partial-ap", error: "Some lines have an unknown price, so they can't post an A/P bill. Confirm an inventory-only / partial-A/P apply, or add the missing prices." });
      }

      // resolve the vendor once (find-or-create within the tenant tx).
      const vendorName = invoice.vendorNameRaw?.trim() || null;
      const vendor = vendorName ? await findOrCreateVendorCore({ name: vendorName }, tx) : null;
      const vendorId = vendor?.id ?? null;
      const currency = invoice.currency ?? null;

      const supplyLotIds: string[] = [];
      let apLineCount = 0;

      for (let i = 0; i < receiptLines.length; i++) {
        const line = receiptLines[i];
        const landedLineTotal = allocation[i].landedLineTotal;

        // resolve the material (tenant re-verified: a findUnique under RLS returns null for a foreign-tenant id).
        let materialId: string;
        let stockUnit: string;
        const decision = line.matchDecision ?? "new";
        if (decision === "existing") {
          if (!line.matchedMaterialId) throw new ApplyAbort({ ok: false, error: `Line ${line.lineNo}: marked "add to existing" but no material was chosen.` });
          const m = await tx.cellarMaterial.findUnique({ where: { id: line.matchedMaterialId }, select: { id: true, stockUnit: true } });
          if (!m) throw new ApplyAbort({ ok: false, error: `Line ${line.lineNo}: the chosen existing material isn't in this winery.` });
          materialId = m.id;
          stockUnit = coerceStockUnit(m.stockUnit);
        } else {
          const created = await createStockMaterialCore(
            actor,
            {
              name: line.descriptionRaw,
              kind: coerceFamily(line.resolvedKind),
              category: line.resolvedCategory ? coerceMaterialCategory(line.resolvedCategory) : undefined,
              stockUnit: stockUnitForNewLine(line.unitRaw),
              openingQty: 0, // create at ZERO stock; the receiveSupplyCore below emits the costed lot + A/P (unified path)
            },
            tx,
          );
          materialId = created.id;
          stockUnit = coerceStockUnit(created.stockUnit);
        }

        // normalize invoice qty/unit → stock qty + per-stock-unit landed cost. A cross-dimension unit is a
        // hard stop (never silently pass raw qty) — the human fixes the unit on the review screen.
        const norm = normalizeLineToStock({ qty: line.qty != null ? Number(line.qty) : null, unit: line.unitRaw, landedLineTotal, stockUnit });
        if (norm.stockQty == null) {
          throw new ApplyAbort({ ok: false, error: `Line ${line.lineNo} ("${line.descriptionRaw}"): can't convert "${line.unitRaw ?? "?"}" into ${stockUnit}. Fix the unit on the review screen.` });
        }

        const received = await receiveSupplyCore(
          actor,
          {
            materialId,
            qty: norm.stockQty,
            unitCost: norm.unitCost,
            lotCode: line.lotNoRaw,
            vendorId,
            vendorInvoiceNumber: invoice.vendorInvoiceNumber,
            currency,
          },
          tx,
        );
        supplyLotIds.push(received.supplyLotId);
        if (norm.unitCost != null) apLineCount++;

        // persist the audit marker + allocated cost on the staged line.
        await tx.ingestedInvoiceLine.update({ where: { id: line.id }, data: { createdSupplyLotId: received.supplyLotId, allocatedUnitCost: norm.unitCost } });

        // provenance: link the created lot to this invoice.
        await tx.lotDocument.create({ data: { supplyLotId: received.supplyLotId, ingestedInvoiceId: invoice.id, role: "INVOICE" } });

        // backfill the vendor-scoped item code — ONLY on a human-confirmed `existing` match and only if absent
        // (so one bad OCR code can't poison future dedup, council P2).
        if (decision === "existing" && vendorId && line.vendorItemCodeRaw?.trim()) {
          const code = line.vendorItemCodeRaw.trim();
          const present = await tx.vendorMaterialCode.findFirst({ where: { vendorId, code }, select: { id: true } });
          if (!present) {
            await tx.vendorMaterialCode.create({ data: { vendorId, materialId, code } }).catch(() => undefined); // ignore a race on the unique
          }
        }
      }

      // COA attach: within the SAME ingestion batch, match a COA's lot no. to a created lot's lotCode and set
      // expiry + a COA provenance link. Constrained to same batch (council P3 — a colliding lot no. in another
      // batch can't attach to the wrong stock). Read/surface side is Unit 10.
      await attachBatchCoas(tx, invoice.id, supplyLotIds);

      await tx.ingestedInvoice.update({ where: { id: invoice.id }, data: { status: "applied", appliedAt: new Date(), vendorId } });
      await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "IngestedInvoice", entityId: invoice.id, summary: `Applied invoice ${invoice.vendorInvoiceNumber ?? invoice.id} — ${supplyLotIds.length} lot(s)${vendorId ? "" : ", no vendor"}` });

      return { ok: true as const, vendorId, supplyLotIds, apLineCount };
    });
  } catch (e) {
    if (e instanceof ApplyAbort) return e.result;
    return { ok: false, error: e instanceof Error ? e.message : "Apply failed." };
  }
}

/** Attach same-batch COAs (docType coa) to the just-created lots by normalized lot no.: set SupplyLot.expiresAt
 *  + a COA LotDocument. Ambiguous/no-match → left unattached (never guessed). */
async function attachBatchCoas(tx: Tx, ingestedInvoiceId: string, supplyLotIds: string[]): Promise<void> {
  if (supplyLotIds.length === 0) return;
  const inv = await tx.ingestedInvoice.findUnique({ where: { id: ingestedInvoiceId }, select: { batchId: true } });
  if (!inv) return;
  const coaDocs = await tx.ingestedInvoice.findMany({ where: { batchId: inv.batchId, docType: "coa" }, select: { id: true, extractedJson: true } });
  if (coaDocs.length === 0) return;

  const lots = await tx.supplyLot.findMany({ where: { id: { in: supplyLotIds } }, select: { id: true, lotCode: true } });
  const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s\-]/g, "");
  const byLot = new Map<string, { id: string }>();
  for (const l of lots) if (l.lotCode) byLot.set(norm(l.lotCode), { id: l.id });

  for (const coa of coaDocs) {
    const doc = coa.extractedJson as unknown as ExtractedDocument;
    const lotNo = norm(doc?.coa?.lotNo);
    if (!lotNo) continue;
    const target = byLot.get(lotNo);
    if (!target) continue;
    const expiry = doc?.coa?.expiry ? new Date(doc.coa.expiry) : null;
    if (expiry && !Number.isNaN(expiry.getTime())) {
      await tx.supplyLot.update({ where: { id: target.id }, data: { expiresAt: expiry } });
    }
    const exists = await tx.lotDocument.findFirst({ where: { supplyLotId: target.id, ingestedInvoiceId: coa.id, role: "COA" }, select: { id: true } });
    if (!exists) await tx.lotDocument.create({ data: { supplyLotId: target.id, ingestedInvoiceId: coa.id, role: "COA" } });
  }
}
