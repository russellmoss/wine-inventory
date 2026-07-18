import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createStockMaterialCore, receiveSupplyCore } from "@/lib/cellar/materials";
import { findOrCreateVendorCore } from "@/lib/vendors/vendors";
import { allocateLandedCost, type InvoiceCharges } from "@/lib/ingest/landed-cost";
import { normalizeLineToStock, parsePackagingUnit } from "@/lib/ingest/normalize-line";
import { coerceStockUnit } from "@/lib/cellar/materials-shared";
import { coerceFamily, coerceMaterialCategory, categoryOf } from "@/lib/cellar/material-taxonomy";
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
          // Plan 072: pre-select the family + category from the AI's suggestion (category derived from the
          // family so it's always consistent + cost-safe). The human can still change either on the review.
          const suggestedKind = ln.family ? coerceFamily(ln.family) : null;
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
              resolvedKind: suggestedKind,
              resolvedCategory: suggestedKind ? categoryOf(suggestedKind) : null,
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
          // Plan 072: pre-fill the created material's setup fields from the intake — the vendor (we always
          // capture it), the AI-parsed brand/product/generic names, and the human-confirmed pack size — so the
          // expendables edit view isn't blank after an ingest.
          const ex = extracted?.lines?.[line.lineNo - 1];
          const created = await createStockMaterialCore(
            actor,
            {
              name: line.descriptionRaw,
              kind: coerceFamily(line.resolvedKind),
              category: line.resolvedCategory ? coerceMaterialCategory(line.resolvedCategory) : undefined,
              stockUnit: stockUnitForNewLine(line.unitRaw),
              openingQty: 0, // create at ZERO stock; the receiveSupplyCore below emits the costed lot + A/P (unified path)
              vendorId, // link the intake's vendor
              genericName: ex?.genericName ?? null,
              brand: ex?.brand ?? null,
              brandName: ex?.productName ?? null,
            },
            tx,
          );
          materialId = created.id;
          stockUnit = coerceStockUnit(created.stockUnit);
          // Store the human-confirmed pack size as the material's package metadata. NOT via the core's package
          // path (which would seed a duplicate opening lot) — a direct metadata write; receiveSupplyCore below
          // records the real stock. packageUnit stays the invoice unit ("kg"); stockUnit is the canonical unit.
          const pk = parsePackagingUnit(line.unitRaw);
          if (pk.amount > 0 && pk.unit) {
            await tx.cellarMaterial.update({ where: { id: materialId }, data: { packageAmount: pk.amount, packageUnit: pk.unit } });
          }
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

// ── read: recent intakes (assistant visibility) ──

export type RecentIntakeLot = { materialId: string; materialName: string; qty: number; stockUnit: string; unitCost: number | null };
export type RecentIntake = {
  id: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  docType: string;
  status: string;
  currency: string | null;
  invoiceTotal: number | null;
  createdAt: string;
  appliedAt: string | null;
  lots: RecentIntakeLot[]; // the lots this intake created (populated for applied invoices)
};

/**
 * Recent ingested documents for the tenant (newest first) with, for APPLIED ones, the lots they created +
 * the material each landed on. Assumes a tenant context (called from an assistant read tool / action → RLS).
 */
export async function listRecentIntakes(opts?: { limit?: number }): Promise<RecentIntake[]> {
  const take = Math.min(Math.max(opts?.limit ?? 10, 1), 50);
  const invs = await prisma.ingestedInvoice.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, vendorNameRaw: true, vendorInvoiceNumber: true, docType: true, status: true, currency: true, invoiceTotal: true, createdAt: true, appliedAt: true },
  });
  if (invs.length === 0) return [];

  // Resolve created lots for the applied invoices in one pass.
  const lines = await prisma.ingestedInvoiceLine.findMany({
    where: { ingestedInvoiceId: { in: invs.map((i) => i.id) }, createdSupplyLotId: { not: null } },
    select: { ingestedInvoiceId: true, createdSupplyLotId: true },
  });
  const lotIds = lines.map((l) => l.createdSupplyLotId).filter((x): x is string => !!x);
  const lots = lotIds.length
    ? await prisma.supplyLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, materialId: true, qtyReceived: true, stockUnit: true, unitCost: true } })
    : [];
  const matIds = [...new Set(lots.map((l) => l.materialId))];
  const mats = matIds.length ? await prisma.cellarMaterial.findMany({ where: { id: { in: matIds } }, select: { id: true, name: true } }) : [];
  const matName = new Map(mats.map((m) => [m.id, m.name]));
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const lotsByInvoice = new Map<string, RecentIntakeLot[]>();
  for (const ln of lines) {
    const lot = ln.createdSupplyLotId ? lotById.get(ln.createdSupplyLotId) : null;
    if (!lot) continue;
    const arr = lotsByInvoice.get(ln.ingestedInvoiceId) ?? [];
    arr.push({ materialId: lot.materialId, materialName: matName.get(lot.materialId) ?? "?", qty: Number(lot.qtyReceived), stockUnit: lot.stockUnit, unitCost: lot.unitCost == null ? null : Number(lot.unitCost) });
    lotsByInvoice.set(ln.ingestedInvoiceId, arr);
  }

  return invs.map((i) => ({
    id: i.id,
    vendorName: i.vendorNameRaw,
    invoiceNumber: i.vendorInvoiceNumber,
    docType: i.docType,
    status: i.status,
    currency: i.currency,
    invoiceTotal: i.invoiceTotal == null ? null : Number(i.invoiceTotal),
    createdAt: i.createdAt.toISOString(),
    appliedAt: i.appliedAt ? i.appliedAt.toISOString() : null,
    lots: lotsByInvoice.get(i.id) ?? [],
  }));
}

// ── reverse an applied intake (governed money) ──

export type ReverseResult =
  | { ok: true; reversedLotIds: string[]; deletedMaterialIds: string[]; keptMaterialIds: string[]; apRemoved: number }
  | { ok: false; error: string };

/**
 * Reverse an APPLIED ingested invoice: remove the lots + A/P it created and the materials it newly created,
 * then discard the invoice. All-or-nothing in ONE tx. GUARDS (returns { ok:false } — never throws): the
 * invoice must be `applied`; none of its lots may have downstream consumption; and no A/P may be posted to
 * QBO (a posted bill must be reversed in QBO, not deleted). A material that pre-existed (an `existing` match,
 * or one with other lots) is KEPT — only lots we created are removed from it; a material we created empty and
 * that now has no lots is deleted (deactivated if a stray FK blocks it). The vendor is always kept (reusable).
 */
export async function reverseIngestedInvoiceCore(actor: LedgerActor, input: { ingestedInvoiceId: string }): Promise<ReverseResult> {
  try {
    return await runInTenantTx(async (tx) => {
      const inv = await tx.ingestedInvoice.findUnique({ where: { id: input.ingestedInvoiceId }, select: { id: true, status: true, vendorInvoiceNumber: true } });
      if (!inv) throw new ReverseAbort({ ok: false, error: "That intake isn't in this winery." });
      if (inv.status !== "applied") throw new ReverseAbort({ ok: false, error: "Only an applied intake can be reversed." });

      const lines = await tx.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: inv.id }, select: { createdSupplyLotId: true, matchDecision: true, matchedMaterialId: true } });
      const lotIds = lines.map((l) => l.createdSupplyLotId).filter((x): x is string => !!x);
      if (lotIds.length === 0) throw new ReverseAbort({ ok: false, error: "This intake created no lots to reverse." });

      // Guard: no downstream consumption (reversing used stock would corrupt cost — COST-1/COST-2).
      const consumed = await tx.supplyConsumption.count({ where: { supplyLotId: { in: lotIds } } });
      if (consumed > 0) throw new ReverseAbort({ ok: false, error: "Some of this stock has already been used, so it can't be auto-reversed. Correct it per item instead." });

      // Guard: no A/P bill already posted to QBO.
      const evs = await tx.apExportEvent.findMany({ where: { supplyLotId: { in: lotIds } }, select: { id: true } });
      const evIds = evs.map((e) => e.id);
      const deliveries = evIds.length
        ? await tx.accountingDelivery.findMany({ where: { apExportEventId: { in: evIds } }, select: { id: true, status: true, externalId: true } })
        : [];
      if (deliveries.some((d) => d.status === "POSTED" || d.externalId)) {
        throw new ReverseAbort({ ok: false, error: "An A/P bill from this intake was already posted to QuickBooks. Reverse the bill in QuickBooks first, then discard the intake." });
      }

      const lots = await tx.supplyLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, materialId: true } });
      const matIds = [...new Set(lots.map((l) => l.materialId))];
      // Materials created by this apply (a non-existing line) are candidates to delete; existing-match ones stay.
      const createdMatIds = new Set(
        lines.filter((l) => l.matchDecision !== "existing" && l.createdSupplyLotId)
          .map((l) => lots.find((lot) => lot.id === l.createdSupplyLotId)?.materialId)
          .filter((x): x is string => !!x),
      );

      // Remove A/P deliveries + events, provenance links, then the lots (SET NULLs line.createdSupplyLotId).
      await tx.accountingDelivery.deleteMany({ where: { apExportEventId: { in: evIds } } });
      await tx.apExportEvent.deleteMany({ where: { id: { in: evIds } } });
      await tx.lotDocument.deleteMany({ where: { supplyLotId: { in: lotIds } } });
      await tx.supplyLot.deleteMany({ where: { id: { in: lotIds } } });

      const deletedMaterialIds: string[] = [];
      const keptMaterialIds: string[] = [];
      for (const mid of matIds) {
        const remaining = await tx.supplyLot.count({ where: { materialId: mid } });
        if (remaining === 0 && createdMatIds.has(mid)) {
          try {
            await tx.vendorMaterialCode.deleteMany({ where: { materialId: mid } });
            await tx.cellarMaterial.delete({ where: { id: mid } });
            deletedMaterialIds.push(mid);
          } catch {
            // A stray FK (shouldn't happen for a freshly-created material) → deactivate instead of deleting.
            await tx.cellarMaterial.update({ where: { id: mid }, data: { isActive: false } });
            keptMaterialIds.push(mid);
          }
        } else {
          keptMaterialIds.push(mid);
        }
      }

      await tx.ingestedInvoice.update({ where: { id: inv.id }, data: { status: "discarded", appliedAt: null } });
      await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "IngestedInvoice", entityId: inv.id, summary: `Reversed intake ${inv.vendorInvoiceNumber ?? inv.id} — removed ${lotIds.length} lot(s), ${deletedMaterialIds.length} material(s), ${evIds.length} A/P` });

      return { ok: true as const, reversedLotIds: lotIds, deletedMaterialIds, keptMaterialIds, apRemoved: evIds.length };
    });
  } catch (e) {
    if (e instanceof ReverseAbort) return e.result;
    return { ok: false, error: e instanceof Error ? e.message : "Reverse failed." };
  }
}

class ReverseAbort extends Error {
  constructor(public result: ReverseResult) {
    super("reverse-abort");
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
