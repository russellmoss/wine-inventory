/**
 * Plan 072 Unit 7 — governed money-path proof for invoice ingestion, run against Demo Winery.
 *
 *   npm run verify:ingest
 *
 * Proves applyIngestedInvoiceCore end-to-end: vendor find-or-create, freight-inclusive per-stock-unit landed
 * cost, UOM normalization (invoice unit → stock unit), unified new+existing path both emitting A/P stamped
 * with the invoice #, atomic all-or-nothing rollback, the proforma / reconciliation / double-apply gates,
 * tenant re-verification, COA expiry attach, and EQUIPMENT non-doseability. QA fixtures only (org_demo_winery,
 * "QA-Ingest*" prefix); cleaned up before AND after; A/P accounts saved + restored.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import {
  createIngestedInvoiceCore,
  updateIngestedInvoiceLineCore,
  updateIngestedInvoiceCore,
  applyIngestedInvoiceCore,
  reverseIngestedInvoiceCore,
  setInvoicePaymentStatusCore,
  listRecentIntakes,
  type IngestDocumentInput,
  type ApplyDeps,
} from "@/lib/ingest/ingest-invoice-core";
import { createStockMaterialCore, listMaterialLots } from "@/lib/cellar/materials";
import { isDoseableCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import type { ExtractedDocument } from "@/lib/ingest/extract-invoice";

// Plan 073: a deterministic FX stub so the money assertions don't depend on the live feed. Fixed rate,
// fixed quote date. `getRate(base, foreign, at)` → base-per-foreign.
const fxStub = (rate: number): ApplyDeps => ({
  getRate: async () => ({ ok: true, rate, rateDate: new Date("2026-06-12T00:00:00.000Z"), source: "verify-ingest-stub" }),
});
const fxMiss = (): ApplyDeps => ({ getRate: async () => ({ ok: false, reason: "stubbed miss" }) });

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "verify-ingest@demowinery.test" };
const PFX = "QA-Ingest";

let passed = 0;
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok - ${msg}`);
  passed++;
}

function doc(over: Partial<ExtractedDocument>): ExtractedDocument {
  return { docType: "invoice", vendor: null, currency: "USD", invoiceNumber: null, invoiceTotal: null, lines: [], charges: null, coa: null, warnings: [], notes: null, ...over };
}
function input(fileName: string, document: ExtractedDocument, batchId: string): { batchId: string; documents: IngestDocumentInput[] } {
  return { batchId, documents: [{ blobUrl: `local://${fileName}`, fileName, mimeType: "application/pdf", document }] };
}

async function cleanup() {
  await runAsTenant(TENANT, async () => {
    const invs = await prisma.ingestedInvoice.findMany({ where: { batchId: { startsWith: PFX } }, select: { id: true } });
    const invIds = invs.map((i) => i.id);
    const mats = await prisma.cellarMaterial.findMany({ where: { name: { startsWith: PFX } }, select: { id: true } });
    const matIds = mats.map((m) => m.id);
    const vends = await prisma.vendor.findMany({ where: { name: { startsWith: PFX } }, select: { id: true } });
    const vendIds = vends.map((v) => v.id);
    // Lots reachable via QA materials OR QA vendors (a lot FKs to both — cover both so vendor delete is clean).
    const lots = await prisma.supplyLot.findMany({ where: { OR: [{ materialId: { in: matIds } }, { vendorId: { in: vendIds } }] }, select: { id: true } });
    const lotIds = lots.map((l) => l.id);
    const evs = await prisma.apExportEvent.findMany({ where: { OR: [{ supplyLotId: { in: lotIds } }, { vendorId: { in: vendIds } }] }, select: { id: true } });
    const evIds = evs.map((e) => e.id);
    await prisma.accountingDelivery.deleteMany({ where: { apExportEventId: { in: evIds } } });
    await prisma.lotDocument.deleteMany({ where: { OR: [{ ingestedInvoiceId: { in: invIds } }, { supplyLotId: { in: lotIds } }] } });
    await prisma.apExportEvent.deleteMany({ where: { id: { in: evIds } } });
    await prisma.vendorMaterialCode.deleteMany({ where: { OR: [{ materialId: { in: matIds } }, { vendorId: { in: vendIds } }] } });
    await prisma.supplyLot.deleteMany({ where: { id: { in: lotIds } } });
    await prisma.ingestedInvoiceLine.deleteMany({ where: { ingestedInvoiceId: { in: invIds } } });
    await prisma.ingestedInvoice.deleteMany({ where: { id: { in: invIds } } });
    await prisma.cellarMaterial.deleteMany({ where: { OR: [{ id: { in: matIds } }, { vendorId: { in: vendIds } }] } });
    await prisma.vendor.deleteMany({ where: { id: { in: vendIds } } });
    await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  });
}

async function main() {
  await cleanup();

  // Save + set A/P accounts so emitApExportForReceipt posts (event needs inv+ap accounts + vendor + known cost).
  const saved = await runAsTenant(TENANT, async () => {
    const s = await prisma.appSettings.findFirst({ select: { id: true, apInventoryAccount: true, apPayableAccount: true } });
    if (s?.id) await prisma.appSettings.update({ where: { id: s.id }, data: { apInventoryAccount: s.apInventoryAccount ?? "Inventory Asset", apPayableAccount: s.apPayableAccount ?? "Accounts Payable" } });
    return s;
  });

  try {
    await runAsTenant(TENANT, async () => {
      // ── Scenario 1: full invoice apply — 2 new lines, USD, shipping folded into landed cost, A/P emitted ──
      {
        const batch = `${PFX}-1-${Date.now()}`;
        const d = doc({
          vendor: { name: `${PFX} Scott Labs` },
          invoiceNumber: "QA-SIV-1",
          invoiceTotal: 385.79 + 100, // goods 385.79 + shipping 100
          charges: { shipping: 100 },
          lines: [
            { description: `${PFX} Yeast EC1118`, qty: 1000, unit: "g", unitPrice: 0.30779, lineTotal: 307.79, lotNo: "QA-LOT-1", family: "YEAST" },
            { description: `${PFX} Bentonite`, qty: 1000, unit: "g", unitPrice: 0.078, lineTotal: 78.0, lotNo: "QA-LOT-2" },
          ],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-inv-1.pdf", d, batch));
        const invId = created.invoices[0].id;
        const lines = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId }, orderBy: { lineNo: "asc" } });
        // AI family suggestion pre-selects family + derived category on the staged line (auto-selected in review)
        assert(lines[0].resolvedKind === "YEAST" && lines[0].resolvedCategory === "ADDITIVE", `scenario 1: extracted family pre-selects kind+category (got ${lines[0].resolvedKind}/${lines[0].resolvedCategory})`);
        for (const l of lines) await updateIngestedInvoiceLineCore(ACTOR, l.id, { matchDecision: "new", resolvedKind: "YEAST" });

        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(res.ok, "scenario 1: apply succeeds");
        if (!res.ok) return;
        assert(res.vendorId != null, "scenario 1: vendor created");
        assert(res.supplyLotIds.length === 2, "scenario 1: 2 supply lots created");

        const lots = await prisma.supplyLot.findMany({ where: { id: { in: res.supplyLotIds } }, orderBy: { lotCode: "asc" } });
        // Freight ($100) split by subtotal (307.79 : 78.00 of 385.79) → 79.78 / 20.22. Line 1 landed = 387.57
        // over 1000 g → 0.38757/g; line 2 landed = 98.22 over 1000 g → 0.09822/g.
        const byLot = new Map(lots.map((l) => [l.lotCode, l]));
        const l1 = byLot.get("QA-LOT-1")!;
        const l2 = byLot.get("QA-LOT-2")!;
        assert(Math.abs(Number(l1.unitCost) - 0.38757) < 1e-5, `scenario 1: line 1 freight-inclusive unitCost ≈ 0.38757 (got ${l1.unitCost})`);
        assert(Math.abs(Number(l2.unitCost) - 0.09822) < 1e-5, `scenario 1: line 2 freight-inclusive unitCost ≈ 0.09822 (got ${l2.unitCost})`);
        assert(Number(l1.qtyReceived) === 1000, "scenario 1: line 1 stock qty = 1000 g");
        assert(lots.every((l) => l.currency === "USD"), "scenario 1: lots stamped USD");

        // Plan 076: ONE aggregate A/P event per invoice (not per lot), multi-line, keyed apinv:<invoiceId>.
        const perLot = await prisma.apExportEvent.findMany({ where: { supplyLotId: { in: res.supplyLotIds } } });
        assert(perLot.length === 0, `scenario 1: NO per-lot A/P events — the aggregate owns A/P (got ${perLot.length})`);
        const evs = await prisma.apExportEvent.findMany({ where: { ingestedInvoiceId: invId } });
        assert(evs.length === 1, `scenario 1: exactly ONE aggregate A/P bill for the invoice (got ${evs.length})`);
        const agg = evs[0];
        assert(agg.postingKey === `apinv:${invId}`, "scenario 1: aggregate event keyed apinv:<invoiceId>");
        assert(agg.vendorInvoiceNumber === "QA-SIV-1", "scenario 1: aggregate A/P stamped with the invoice #");
        const bl = (agg.billLinesJson as { amount: number; debitAccount: string }[] | null) ?? [];
        assert(bl.length === 2, `scenario 1: aggregate carries 2 bill lines (got ${bl.length})`);
        assert(Math.abs(Number(agg.amount) - 485.79) < 0.02, `scenario 1: aggregate amount = Σ landed lines (387.57 + 98.22 = 485.79, got ${agg.amount})`);
        assert(Math.abs(Number(bl[0].amount) - 387.57) < 0.02 && Math.abs(Number(bl[1].amount) - 98.22) < 0.02, "scenario 1: bill lines carry the per-line landed amounts");

        const inv = await prisma.ingestedInvoice.findUnique({ where: { id: invId }, select: { status: true } });
        assert(inv?.status === "applied", "scenario 1: invoice marked applied");

        // double-apply rejected
        const again = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(!again.ok, "scenario 1: double-apply rejected");
      }

      // ── Scenario 2: UOM normalization — "2 × 25 kg" into a new g-stock material → 50000 g ──
      {
        const batch = `${PFX}-2-${Date.now()}`;
        const d = doc({
          vendor: { name: `${PFX} BulkCo` },
          invoiceNumber: "QA-UOM-1",
          invoiceTotal: 100,
          lines: [{ description: `${PFX} Tartaric Acid`, qty: 2, unit: "25 kg", unitPrice: 50, lineTotal: 100, lotNo: "QA-UOM-LOT" }],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-uom.pdf", d, batch));
        const invId = created.invoices[0].id;
        const [line] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId } });
        await updateIngestedInvoiceLineCore(ACTOR, line.id, { matchDecision: "new", resolvedKind: "ACID" });
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(res.ok, "scenario 2: UOM apply succeeds");
        if (!res.ok) return;
        const lot = await prisma.supplyLot.findUnique({ where: { id: res.supplyLotIds[0] } });
        assert(Number(lot!.qtyReceived) === 50000, `scenario 2: 2 × 25 kg → 50000 g (got ${lot!.qtyReceived})`);
        assert(Math.abs(Number(lot!.unitCost) - 0.002) < 1e-6, `scenario 2: per-g cost = 100/50000 = 0.002 (got ${lot!.unitCost})`);
        // the created material is pre-filled from the intake: vendor + pack size (edit-view gap fix)
        const mat = await prisma.cellarMaterial.findUnique({ where: { id: lot!.materialId }, select: { vendorId: true, packageAmount: true, packageUnit: true } });
        assert(mat!.vendorId != null, "scenario 2: new material links the intake vendor");
        assert(mat!.packageAmount != null && Number(mat!.packageAmount) === 25 && mat!.packageUnit === "kg", `scenario 2: new material pack size = 25 kg (got ${mat!.packageAmount} ${mat!.packageUnit})`);
      }

      // ── Scenario 3: proforma gate + EUR currency + EQUIPMENT non-doseable ──
      {
        const batch = `${PFX}-3-${Date.now()}`;
        const d = doc({
          docType: "proforma",
          currency: "EUR",
          vendor: { name: `${PFX} NexaParts` },
          invoiceNumber: "QA-PF-1",
          invoiceTotal: 200,
          lines: [{ description: `${PFX} Stainless Clamp`, qty: 4, unit: "unit", unitPrice: 50, lineTotal: 200, lotNo: null }],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-proforma.pdf", d, batch));
        const invId = created.invoices[0].id;
        const [line] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId } });
        await updateIngestedInvoiceLineCore(ACTOR, line.id, { matchDecision: "new", resolvedKind: "EQUIPMENT", resolvedCategory: "EQUIPMENT" });

        const blocked = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(!blocked.ok, "scenario 3: proforma blocked until marked landed");

        await updateIngestedInvoiceCore(ACTOR, invId, { landedReceipt: true });
        // Plan 073: a EUR proforma is CONVERTED to base (USD) at a stubbed rate of 1.10. 4 units @ €50 = €200
        // foreign → base landed €200 × 1.10 = $220 → $55/unit base; foreign $50/unit preserved.
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId }, fxStub(1.1));
        assert(res.ok, "scenario 3: landed proforma applies");
        if (!res.ok) return;
        const lot = await prisma.supplyLot.findUnique({
          where: { id: res.supplyLotIds[0] },
          select: { currency: true, unitCost: true, qtyReceived: true, materialId: true, foreignUnitCost: true, foreignCurrency: true, fxRate: true, fxRateSource: true },
        });
        assert(lot!.currency === "USD", "scenario 3: lot converted to BASE (USD), not stamped EUR");
        assert(Math.abs(Number(lot!.unitCost) - 55) < 1e-6, `scenario 3: base unitCost = 200×1.10/4 = 55 (got ${lot!.unitCost})`);
        assert(lot!.foreignCurrency === "EUR" && Math.abs(Number(lot!.foreignUnitCost) - 50) < 1e-6, `scenario 3: foreign €50/unit preserved (got ${lot!.foreignCurrency} ${lot!.foreignUnitCost})`);
        assert(Math.abs(Number(lot!.fxRate) - 1.1) < 1e-9 && lot!.fxRateSource === "verify-ingest-stub", "scenario 3: rate + source stamped on the lot");
        // A/P is DECOUPLED (council #1): the aggregate event carries the FOREIGN amount + currency + exchangeRate.
        const ev = await prisma.apExportEvent.findFirst({ where: { ingestedInvoiceId: invId } });
        assert(ev != null && ev.currency === "EUR", "scenario 3: A/P event is in EUR (foreign), not base");
        assert(Math.abs(Number(ev!.amount) - 200) < 1e-6, `scenario 3: A/P amount = FOREIGN €200 (got ${ev!.amount})`);
        assert(Math.abs(Number(ev!.exchangeRate) - 1.1) < 1e-9, `scenario 3: A/P exchangeRate = 1.10 (got ${ev!.exchangeRate})`);
        // Reconciliation invariant: base inventory value == round2(foreign A/P amount × exchangeRate).
        const baseInvValue = Number(lot!.qtyReceived) * Number(lot!.unitCost);
        const recon = Math.round(Number(ev!.amount) * Number(ev!.exchangeRate) * 100) / 100;
        assert(Math.abs(baseInvValue - recon) < 0.01, `scenario 3: RECONCILIATION base ${baseInvValue} == round2(foreign×rate) ${recon}`);
        const mat = await prisma.cellarMaterial.findUnique({ where: { id: lot!.materialId }, select: { category: true } });
        assert(mat!.category === "EQUIPMENT", "scenario 3: material category is EQUIPMENT");
        assert(isDoseableCategory(mat!.category as MaterialCategory) === false, "scenario 3: EQUIPMENT is NON-doseable");
      }

      // ── Scenario 4: atomic rollback — an unconvertible unit on line 2 rolls back line 1 too ──
      {
        const batch = `${PFX}-4-${Date.now()}`;
        const d = doc({
          vendor: { name: `${PFX} RollbackCo` },
          invoiceNumber: "QA-RB-1",
          invoiceTotal: 60,
          lines: [
            { description: `${PFX} Good Line`, qty: 100, unit: "g", unitPrice: 0.3, lineTotal: 30, lotNo: "QA-RB-OK" },
            { description: `${PFX} Bad Unit Line`, qty: 1, unit: "case", unitPrice: 30, lineTotal: 30, lotNo: "QA-RB-BAD" },
          ],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-rb.pdf", d, batch));
        const invId = created.invoices[0].id;
        const lines = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId }, orderBy: { lineNo: "asc" } });
        // line 1 → new g-stock; line 2 unit "case" can't convert to a real stock unit → dimension mismatch
        await updateIngestedInvoiceLineCore(ACTOR, lines[0].id, { matchDecision: "new", resolvedKind: "OTHER" });
        await updateIngestedInvoiceLineCore(ACTOR, lines[1].id, { matchDecision: "new", resolvedKind: "OTHER", resolvedCategory: "OTHER" });
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId, allowReconcileMismatch: true });
        assert(!res.ok, "scenario 4: apply blocked by the unconvertible unit");
        const okMat = await prisma.cellarMaterial.findFirst({ where: { name: `${PFX} Good Line` }, select: { id: true } });
        const lotCount = okMat ? await prisma.supplyLot.count({ where: { materialId: okMat.id } }) : 0;
        assert(lotCount === 0, "scenario 4: ZERO lots committed — atomic rollback (line 1 rolled back with line 2)");
        const inv = await prisma.ingestedInvoice.findUnique({ where: { id: invId }, select: { status: true } });
        assert(inv?.status === "pending", "scenario 4: staging reverted to pending after rollback");
      }

      // ── Scenario 5: existing-match dedup + reconciliation gate ──
      {
        const batch = `${PFX}-5-${Date.now()}`;
        // seed an existing material
        const existing = await createStockMaterialCore(ACTOR, { name: `${PFX} Existing Yeast`, kind: "YEAST", stockUnit: "g", openingQty: 0 });
        const d = doc({
          vendor: { name: `${PFX} DedupCo` },
          invoiceNumber: "QA-DED-1",
          invoiceTotal: 999, // deliberately NOT equal to line totals → reconciliation gate
          lines: [{ description: `${PFX} Existing Yeast`, qty: 500, unit: "g", unitPrice: 0.2, lineTotal: 100, vendorItemCode: "SKU-123", lotNo: "QA-DED-LOT" }],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-dedup.pdf", d, batch));
        const invId = created.invoices[0].id;
        const [line] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId } });
        await updateIngestedInvoiceLineCore(ACTOR, line.id, { matchDecision: "existing", matchedMaterialId: existing.id });

        const gated = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(!gated.ok && gated.needsAck === "reconcile", "scenario 5: reconciliation mismatch blocks apply (needsAck=reconcile)");

        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId, allowReconcileMismatch: true });
        assert(res.ok, "scenario 5: apply proceeds with the inventory-only ack");
        if (!res.ok) return;
        const dedupLot = await prisma.supplyLot.findUnique({ where: { id: res.supplyLotIds[0] }, select: { materialId: true } });
        assert(dedupLot!.materialId === existing.id, "scenario 5: existing match routed to the existing material — no duplicate created");
        const code = await prisma.vendorMaterialCode.findFirst({ where: { materialId: existing.id, code: "SKU-123" } });
        assert(code != null, "scenario 5: vendor-scoped item code backfilled on the confirmed existing match");

        // tenant guard (council P3): the composite (tenantId, matchedMaterialId) FK makes it impossible to even
        // STAGE a pointer to a material that isn't in this tenant — a cross-tenant/nonexistent id is rejected
        // at the staging write, before apply ever runs (the apply-time findUnique re-check is belt-and-suspenders).
        const batch6 = `${PFX}-6-${Date.now()}`;
        const created6 = await createIngestedInvoiceCore(ACTOR, input("qa-bogus.pdf", doc({ vendor: { name: `${PFX} X` }, invoiceNumber: "QA-X", invoiceTotal: 10, lines: [{ description: `${PFX} L`, qty: 1, unit: "g", unitPrice: 10, lineTotal: 10 }] }), batch6));
        const [l6] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: created6.invoices[0].id } });
        let fkRejected = false;
        try {
          await updateIngestedInvoiceLineCore(ACTOR, l6.id, { matchDecision: "existing", matchedMaterialId: "nonexistent_material_id" });
        } catch {
          fkRejected = true;
        }
        assert(fkRejected, "scenario 6: composite FK rejects a matchedMaterialId not in this tenant (staging-layer tenant guard, council P3)");
      }

      // ── Scenario 7: COA expiry attach by lot no. within the same batch ──
      {
        const batch = `${PFX}-7-${Date.now()}`;
        const invoiceDoc = doc({ vendor: { name: `${PFX} CoaCo` }, invoiceNumber: "QA-COA-1", invoiceTotal: 50, lines: [{ description: `${PFX} Enzyme`, qty: 100, unit: "g", unitPrice: 0.5, lineTotal: 50, lotNo: "COA-LOT-777" }] });
        const coaDoc = doc({ docType: "coa", vendor: { name: `${PFX} CoaCo` }, coa: { lotNo: "coa lot 777", expiry: "2028-06-01", batch: "B7" }, lines: [] });
        const created = await createIngestedInvoiceCore(ACTOR, {
          batchId: batch,
          documents: [
            { blobUrl: "local://qa-coa-invoice.pdf", fileName: "qa-coa-invoice.pdf", mimeType: "application/pdf", document: invoiceDoc },
            { blobUrl: "local://qa-coa.pdf", fileName: "qa-coa.pdf", mimeType: "application/pdf", document: coaDoc },
          ],
        });
        const invId = created.invoices.find((i) => i.docType === "invoice")!.id;
        const [line] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId } });
        await updateIngestedInvoiceLineCore(ACTOR, line.id, { matchDecision: "new", resolvedKind: "ENZYME" });
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(res.ok, "scenario 7: COA-batch apply succeeds");
        if (!res.ok) return;
        const lot = await prisma.supplyLot.findUnique({ where: { id: res.supplyLotIds[0] }, select: { expiresAt: true } });
        assert(lot!.expiresAt != null, "scenario 7: COA expiry attached to the matched lot (normalized lot no.)");
        const coaLink = await prisma.lotDocument.findFirst({ where: { supplyLotId: res.supplyLotIds[0], role: "COA" } });
        assert(coaLink != null, "scenario 7: COA provenance link written");

        // read side (Unit 10): the material's lot-history read surfaces the expiry + INVOICE/COA doc links.
        const enzymeLot = await prisma.supplyLot.findUnique({ where: { id: res.supplyLotIds[0] }, select: { materialId: true } });
        const history = await listMaterialLots(enzymeLot!.materialId);
        const hRow = history.find((h) => h.id === res.supplyLotIds[0]);
        assert(hRow != null && hRow.expiresAt != null, "scenario 7: listMaterialLots surfaces the lot's expiry (read side)");
        assert(
          hRow!.documents.some((d) => d.role === "INVOICE") && hRow!.documents.some((d) => d.role === "COA"),
          "scenario 7: listMaterialLots surfaces INVOICE + COA source-doc links (read side)",
        );
      }

      // ── Scenario 8: reverse an applied intake (assistant back-out) ──
      {
        const batch = `${PFX}-8-${Date.now()}`;
        const d = doc({
          vendor: { name: `${PFX} ReverseCo` },
          invoiceNumber: "QA-REV-1",
          invoiceTotal: 130,
          charges: { shipping: 30 },
          lines: [
            { description: `${PFX} Rev Yeast`, qty: 500, unit: "g", unitPrice: 0.1, lineTotal: 50, lotNo: "QA-REV-L1" },
            { description: `${PFX} Rev Acid`, qty: 500, unit: "g", unitPrice: 0.1, lineTotal: 50, lotNo: "QA-REV-L2" },
          ],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-rev.pdf", d, batch));
        const invId = created.invoices[0].id;
        const lines = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId } });
        for (const l of lines) await updateIngestedInvoiceLineCore(ACTOR, l.id, { matchDecision: "new", resolvedKind: "YEAST" });
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(res.ok, "scenario 8: intake applies");
        if (!res.ok) return;
        const matIds = (await prisma.supplyLot.findMany({ where: { id: { in: res.supplyLotIds } }, select: { materialId: true } })).map((l) => l.materialId);

        // the read tool sees it as applied with its created lots
        const recent = await listRecentIntakes({ limit: 20 });
        const seen = recent.find((r) => r.id === invId);
        assert(seen != null && seen.status === "applied" && seen.lots.length === 2, "scenario 8: listRecentIntakes shows the applied intake + its 2 lots");

        const rev = await reverseIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(rev.ok, "scenario 8: reverse succeeds");
        if (!rev.ok) return;
        assert((await prisma.supplyLot.count({ where: { id: { in: res.supplyLotIds } } })) === 0, "scenario 8: all created lots removed");
        // Plan 076: the aggregate per-invoice A/P event (+ its delivery) is removed on reverse.
        assert((await prisma.apExportEvent.count({ where: { ingestedInvoiceId: invId } })) === 0, "scenario 8: aggregate A/P event removed");
        assert((await prisma.cellarMaterial.count({ where: { id: { in: matIds } } })) === 0, "scenario 8: the newly-created materials removed");
        const after = await prisma.ingestedInvoice.findUnique({ where: { id: invId }, select: { status: true, appliedAt: true } });
        assert(after?.status === "discarded" && after.appliedAt == null, "scenario 8: intake marked discarded");
        const vendorKept = await prisma.vendor.findFirst({ where: { name: `${PFX} ReverseCo` } });
        assert(vendorKept != null, "scenario 8: vendor kept (reusable)");

        // reversing again (already discarded) is rejected
        const again = await reverseIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(!again.ok, "scenario 8: reversing a non-applied intake is rejected");

        // guard: an intake whose stock was consumed cannot be auto-reversed
        const batch9 = `${PFX}-9-${Date.now()}`;
        const d9 = doc({ vendor: { name: `${PFX} ConsumeCo` }, invoiceNumber: "QA-REV-2", invoiceTotal: 50, lines: [{ description: `${PFX} Consumed Yeast`, qty: 500, unit: "g", unitPrice: 0.1, lineTotal: 50, lotNo: "QA-REV-L3" }] });
        const created9 = await createIngestedInvoiceCore(ACTOR, input("qa-rev2.pdf", d9, batch9));
        const inv9 = created9.invoices[0].id;
        const [l9] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: inv9 } });
        await updateIngestedInvoiceLineCore(ACTOR, l9.id, { matchDecision: "new", resolvedKind: "YEAST" });
        const res9 = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: inv9 });
        assert(res9.ok, "scenario 9: intake applies");
        if (!res9.ok) return;
        // simulate downstream consumption of the lot (a dose) — insert a SupplyConsumption row directly
        const lot9 = res9.supplyLotIds[0];
        const anyOp = await prisma.lotOperation.findFirst({ select: { id: true } });
        if (anyOp) {
          await prisma.supplyConsumption.create({ data: { operationId: anyOp.id, supplyLotId: lot9, qty: 1, methodUsed: "WEIGHTED_AVG" } });
          const blocked = await reverseIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: inv9 });
          assert(!blocked.ok, "scenario 9: reversing consumed stock is blocked");
          await prisma.supplyConsumption.deleteMany({ where: { supplyLotId: lot9 } });
        }
        // clean up scenario 9 via reverse now that consumption is gone
        await reverseIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: inv9 });
      }

      // ── Scenario 10 (Plan 073): FX fail-loud, manual override, historical-cost-not-revalued ──
      {
        const batch = `${PFX}-10-${Date.now()}`;
        // (a) A foreign invoice with NO resolvable rate is BLOCKED — never applied at a fabricated 1.0/$0 (D14).
        const dMiss = doc({ currency: "EUR", vendor: { name: `${PFX} FxMiss` }, invoiceNumber: "QA-FX-MISS", invoiceTotal: 110, lines: [{ description: `${PFX} Widget`, qty: 10, unit: "unit", unitPrice: 11, lineTotal: 110 }] });
        const createdM = await createIngestedInvoiceCore(ACTOR, input("qa-fx-miss.pdf", dMiss, batch));
        const invM = createdM.invoices[0].id;
        const [lM] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invM } });
        await updateIngestedInvoiceLineCore(ACTOR, lM.id, { matchDecision: "new", resolvedKind: "OTHER", resolvedCategory: "OTHER" });
        const missRes = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invM }, fxMiss());
        assert(!missRes.ok && missRes.needsAck === "fx-rate", "scenario 10a: missing rate BLOCKS apply (needsAck fx-rate), never fabricates");
        // The whole tx rolled back: the invoice is back to pending and the line has no created-lot marker.
        const invMafter = await prisma.ingestedInvoice.findUnique({ where: { id: invM }, select: { status: true } });
        const lMafter = await prisma.ingestedInvoiceLine.findUnique({ where: { id: lM.id }, select: { createdSupplyLotId: true } });
        assert(invMafter!.status === "pending" && lMafter!.createdSupplyLotId == null, "scenario 10a: blocked apply wrote nothing (invoice pending, no lot)");

        // (a2) An UNSUPPORTED invoice currency (e.g. an OCR "CHF") must FAIL LOUD — never silently coerce to
        // base and book 1:1 (that would leak a foreign amount into the roll-up at a fabricated 1.0 rate).
        const dBad = doc({ currency: "CHF", vendor: { name: `${PFX} FxUnsupported` }, invoiceNumber: "QA-FX-CHF", invoiceTotal: 55, lines: [{ description: `${PFX} Franc Widget`, qty: 5, unit: "unit", unitPrice: 11, lineTotal: 55 }] });
        const createdB = await createIngestedInvoiceCore(ACTOR, input("qa-fx-chf.pdf", dBad, batch));
        const invB = createdB.invoices[0].id;
        const [lB] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invB } });
        await updateIngestedInvoiceLineCore(ACTOR, lB.id, { matchDecision: "new", resolvedKind: "OTHER", resolvedCategory: "OTHER" });
        const badRes = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invB }, fxStub(1.2));
        assert(!badRes.ok && badRes.needsAck === "fx-rate", "scenario 10a2: an unsupported invoice currency (CHF) FAILS LOUD, never books 1:1");

        // (b) A persisted manual OVERRIDE wins over the feed (contracted rate). €110 × 1.25 = $137.50 base.
        const dOv = doc({ currency: "EUR", vendor: { name: `${PFX} FxOverride` }, invoiceNumber: "QA-FX-OV", invoiceTotal: 110, lines: [{ description: `${PFX} Override Widget`, qty: 10, unit: "unit", unitPrice: 11, lineTotal: 110 }] });
        const createdO = await createIngestedInvoiceCore(ACTOR, input("qa-fx-ov.pdf", dOv, batch));
        const invO = createdO.invoices[0].id;
        const [lO] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invO } });
        await updateIngestedInvoiceLineCore(ACTOR, lO.id, { matchDecision: "new", resolvedKind: "OTHER", resolvedCategory: "OTHER" });
        await updateIngestedInvoiceCore(ACTOR, invO, { fxRate: 1.25, fxRateSource: "manual override" });
        // Pass a DIFFERENT feed rate to prove the override wins.
        const ovRes = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invO }, fxStub(9.99));
        assert(ovRes.ok, "scenario 10b: override apply succeeds");
        if (!ovRes.ok) return;
        const lotO = await prisma.supplyLot.findFirst({ where: { id: { in: ovRes.supplyLotIds } }, select: { unitCost: true, fxRate: true, fxRateSource: true } });
        assert(Math.abs(Number(lotO!.fxRate) - 1.25) < 1e-9 && lotO!.fxRateSource === "manual override", "scenario 10b: manual override rate wins over the feed");
        assert(Math.abs(Number(lotO!.unitCost) - 13.75) < 1e-6, `scenario 10b: base unitCost = 110×1.25/10 = 13.75 (got ${lotO!.unitCost})`);

        // (c) HISTORICAL COST — the base cost is a FROZEN stored value (foreignUnitCost × receipt-rate), never
        // recomputed from a current rate. Seed a wildly different prevailing rate, re-read: the lot is unchanged.
        const beforeCost = Number(lotO!.unitCost);
        const lotOFull = await prisma.supplyLot.findFirst({ where: { id: { in: ovRes.supplyLotIds } }, select: { foreignUnitCost: true, fxRate: true } });
        assert(Math.abs(beforeCost - Number(lotOFull!.foreignUnitCost) * Number(lotOFull!.fxRate)) < 1e-6, "scenario 10c: base cost == foreignUnitCost × receipt-rate (frozen relationship)");
        // A NEW receipt today would resolve a fresh rate; the OLD lot must not move. (No global-cache write —
        // there is simply no revaluation code path; re-reading returns the frozen value.)
        const lotOAgain = await prisma.supplyLot.findFirst({ where: { id: { in: ovRes.supplyLotIds } }, select: { unitCost: true } });
        assert(Number(lotOAgain!.unitCost) === beforeCost, "scenario 10c: inventory cost is historical — never revalued for FX (IAS 21)");
      }

      // ── Scenario 11 (Plan 076): duplicate-invoice guard — detection at stage + hard gate at apply ──
      {
        const batch = `${PFX}-11-${Date.now()}`;
        const mk = (n: number) => doc({ vendor: { name: `${PFX} DupVendor` }, invoiceNumber: "QA-DUP-1", invoiceTotal: 30, lines: [{ description: `${PFX} Dup Yeast`, qty: 100, unit: "g", unitPrice: 0.3, lineTotal: 30, lotNo: `QA-DUP-${n}` }] });

        // first upload has no prior → not a duplicate; applies clean.
        const c1 = await createIngestedInvoiceCore(ACTOR, input("qa-dup-1.pdf", mk(1), batch));
        assert(c1.duplicates.length === 0, "scenario 11: first upload flags no duplicate");
        const inv1 = c1.invoices[0].id;
        const [ln1] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: inv1 } });
        await updateIngestedInvoiceLineCore(ACTOR, ln1.id, { matchDecision: "new", resolvedKind: "YEAST" });
        const r1 = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: inv1 });
        assert(r1.ok, "scenario 11: first invoice applies");

        // second upload with the SAME (vendor, invoice#) → flagged at stage time.
        const c2 = await createIngestedInvoiceCore(ACTOR, input("qa-dup-2.pdf", mk(2), batch));
        assert(c2.duplicates.some((x) => x.kind === "vendor-invoice"), "scenario 11: re-upload of (vendor, invoice#) flagged at stage (vendor-invoice)");
        const inv2 = c2.invoices[0].id;
        const [ln2] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: inv2 } });
        await updateIngestedInvoiceLineCore(ACTOR, ln2.id, { matchDecision: "new", resolvedKind: "YEAST" });

        // apply WITHOUT ack → hard-blocked; the tx rolls back so nothing is booked.
        const blocked = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: inv2 });
        assert(!blocked.ok && blocked.needsAck === "duplicate", "scenario 11: applying a duplicate is BLOCKED (needsAck=duplicate)");
        const inv2mid = await prisma.ingestedInvoice.findUnique({ where: { id: inv2 }, select: { status: true } });
        assert(inv2mid!.status === "pending", "scenario 11: blocked duplicate rolled back to pending — no goods/A/P booked");

        // apply WITH the explicit acknowledgement → proceeds.
        const ok2 = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: inv2, allowDuplicate: true });
        assert(ok2.ok, "scenario 11: duplicate applies once acknowledged (allowDuplicate)");

        // exact-file (fileSha256) duplicate is flagged at stage time too.
        const sha = `qa-dup-sha-${Date.now()}`;
        const fdoc = doc({ vendor: { name: `${PFX} ShaVendor` }, invoiceNumber: "QA-SHA-1", invoiceTotal: 10, lines: [{ description: `${PFX} Sha Line`, qty: 10, unit: "g", unitPrice: 1, lineTotal: 10 }] });
        await createIngestedInvoiceCore(ACTOR, { batchId: batch, documents: [{ blobUrl: "local://sha-a.pdf", fileName: "sha-a.pdf", mimeType: "application/pdf", fileSha256: sha, document: fdoc }] });
        const cSha = await createIngestedInvoiceCore(ACTOR, { batchId: batch, documents: [{ blobUrl: "local://sha-b.pdf", fileName: "sha-b.pdf", mimeType: "application/pdf", fileSha256: sha, document: fdoc }] });
        assert(cSha.duplicates.some((x) => x.kind === "file-hash"), "scenario 11: re-upload of the exact same file flagged at stage (file-hash)");
      }

      // ── Scenario 12 (Plan 076): payment status flows to the aggregate A/P event + post-apply flip ──
      {
        const batch = `${PFX}-12-${Date.now()}`;
        const d = doc({ vendor: { name: `${PFX} PayVendor` }, invoiceNumber: "QA-PAY-1", invoiceTotal: 60, lines: [{ description: `${PFX} Pay Yeast`, qty: 200, unit: "g", unitPrice: 0.3, lineTotal: 60, lotNo: "QA-PAY-L1" }] });
        const c = await createIngestedInvoiceCore(ACTOR, input("qa-pay.pdf", d, batch));
        const invId = c.invoices[0].id;
        const [ln] = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId } });
        await updateIngestedInvoiceLineCore(ACTOR, ln.id, { matchDecision: "new", resolvedKind: "YEAST" });
        // mark PAID from a bank account BEFORE applying (the "paid at ingestion" flow).
        await updateIngestedInvoiceCore(ACTOR, invId, { paymentStatus: "PAID", paidFromAccount: "QA-Bank" });
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(res.ok, "scenario 12: paid invoice applies");
        if (!res.ok) return;
        const agg = await prisma.apExportEvent.findFirst({ where: { ingestedInvoiceId: invId }, select: { paymentStatus: true, paidFromAccount: true, paidAt: true } });
        assert(agg!.paymentStatus === "PAID" && agg!.paidFromAccount === "QA-Bank" && agg!.paidAt != null, "scenario 12: payment status + pay-from + paidAt carried onto the aggregate A/P event");
        const invAfter = await prisma.ingestedInvoice.findUnique({ where: { id: invId }, select: { paidAt: true } });
        assert(invAfter!.paidAt != null, "scenario 12: invoice stamped paidAt on a paid apply");

        // post-apply flip PAID→OUTSTANDING (no BillPayment posted yet → allowed) clears the payment fields.
        const flip = await setInvoicePaymentStatusCore(ACTOR, { ingestedInvoiceId: invId, paymentStatus: "OUTSTANDING" });
        assert(flip.ok, "scenario 12: flip to OUTSTANDING succeeds (no posted bill payment)");
        const aggO = await prisma.apExportEvent.findFirst({ where: { ingestedInvoiceId: invId }, select: { paymentStatus: true, paidFromAccount: true } });
        assert(aggO!.paymentStatus === "OUTSTANDING" && aggO!.paidFromAccount === null, "scenario 12: aggregate event flipped to OUTSTANDING, pay-from cleared");

        // PAID without an account is rejected.
        const noAcct = await setInvoicePaymentStatusCore(ACTOR, { ingestedInvoiceId: invId, paymentStatus: "PAID" });
        assert(!noAcct.ok, "scenario 12: marking PAID without a pay-from account is rejected");

        // a posted BillPayment (simulate paymentExternalId) blocks flipping back to OUTSTANDING.
        await prisma.apExportEvent.updateMany({ where: { ingestedInvoiceId: invId }, data: { paymentStatus: "PAID", paidFromAccount: "QA-Bank", paymentExternalId: "QA-BP-1" } });
        const guarded = await setInvoicePaymentStatusCore(ACTOR, { ingestedInvoiceId: invId, paymentStatus: "OUTSTANDING" });
        assert(!guarded.ok, "scenario 12: can't flip to OUTSTANDING once a bill payment is recorded in QBO (void there first)");

        // and reversing a PAID invoice is blocked until the bill payment is voided in QBO.
        const revPaid = await reverseIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(!revPaid.ok && /paid in QuickBooks/.test(revPaid.error), "scenario 12: reversing a paid invoice is blocked (void the bill payment first)");
      }
    });
  } finally {
    // restore A/P accounts + clean up fixtures
    await runAsTenant(TENANT, async () => {
      if (saved?.id) await prisma.appSettings.update({ where: { id: saved.id }, data: { apInventoryAccount: saved.apInventoryAccount, apPayableAccount: saved.apPayableAccount } });
    });
    await cleanup();
  }

  console.log(`\nALL INGEST CHECKS PASSED ✓ (${passed} assertions)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
