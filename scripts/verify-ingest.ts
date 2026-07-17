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
  type IngestDocumentInput,
} from "@/lib/ingest/ingest-invoice-core";
import { createStockMaterialCore } from "@/lib/cellar/materials";
import { isDoseableCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import type { ExtractedDocument } from "@/lib/ingest/extract-invoice";

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
            { description: `${PFX} Yeast EC1118`, qty: 1000, unit: "g", unitPrice: 0.30779, lineTotal: 307.79, lotNo: "QA-LOT-1" },
            { description: `${PFX} Bentonite`, qty: 1000, unit: "g", unitPrice: 0.078, lineTotal: 78.0, lotNo: "QA-LOT-2" },
          ],
        });
        const created = await createIngestedInvoiceCore(ACTOR, input("qa-inv-1.pdf", d, batch));
        const invId = created.invoices[0].id;
        const lines = await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: invId }, orderBy: { lineNo: "asc" } });
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

        const evs = await prisma.apExportEvent.findMany({ where: { supplyLotId: { in: res.supplyLotIds } } });
        assert(evs.length === 2, `scenario 1: both NEW-material lines emit an A/P bill (got ${evs.length})`);
        assert(evs.every((e) => e.vendorInvoiceNumber === "QA-SIV-1"), "scenario 1: A/P events stamped with the invoice #");
        const evByLot = new Map(evs.map((e) => [e.supplyLotId, e]));
        assert(Math.abs(Number(evByLot.get(l1.id)!.amount) - 387.57) < 0.01, "scenario 1: A/P amount = qty × landed unitCost (387.57)");

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
        const res = await applyIngestedInvoiceCore(ACTOR, { ingestedInvoiceId: invId });
        assert(res.ok, "scenario 3: landed proforma applies");
        if (!res.ok) return;
        const lot = await prisma.supplyLot.findUnique({ where: { id: res.supplyLotIds[0] }, select: { currency: true, materialId: true } });
        assert(lot!.currency === "EUR", "scenario 3: lot stamped EUR (no FX)");
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
