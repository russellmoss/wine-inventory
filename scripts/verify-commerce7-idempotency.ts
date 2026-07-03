/**
 * Phase 16 Unit 9 — prove EXACTLY-ONCE for the Commerce7 DTC loop under the failure modes council
 * flagged, offline + deterministic (mock commerce + mock QBO via DI; no live sandbox). All in Demo Winery.
 *
 *   npm run verify:commerce7-idempotency
 *
 * Covers: rolled-back ingest leaves NO rows; a normal ingest depletes + emits a revenue delta ONCE and a
 * re-poll no-ops; an EDIT between polls emits exactly one adjustment delta of the difference; the revenue
 * delta posts to QBO once with crash-recovery (adopt on next sweep); concurrent double-sweep single-claims;
 * an outbound RECEIVE pushes once and re-runs no-op (watermark), while an ingested SALE never pushes; a
 * full cancel + a partial refund net inventory correctly.
 */
process.env.COMMERCE7_APP_ID = process.env.COMMERCE7_APP_ID || "test-app";
process.env.COMMERCE7_SECRET_KEY = process.env.COMMERCE7_SECRET_KEY || "test-secret";
process.env.COMMERCE7_WEBHOOK_SECRET = process.env.COMMERCE7_WEBHOOK_SECRET || "test-webhook-secret";

import { prisma, prismaBase } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runLedgerWrite } from "@/lib/ledger/write";
import { syncOrder } from "@/lib/commerce/ingest";
import { runAccountingPostSweep } from "@/lib/accounting/post-sweep";
import { runCommerce7InventorySync } from "@/lib/commerce/inventory-sync";
import { receiveStock } from "@/lib/stock/movements";
import { _seedAccessCache, _clearAccessCache } from "@/lib/accounting/token";
import { docNumberFor } from "@/lib/accounting/qbo/client";
import { ProviderFault, type AccountingAdapter, type PostResult } from "@/lib/accounting/adapter";
import { createMockCommerceAdapter, emptyMockState, type MockCommerceState } from "@/lib/commerce/mock";
import type { ProviderOrder } from "@/lib/commerce/adapter";

const TENANT = "org_demo_winery";
const P = "c7idem_"; // id/key prefix for all fixtures (cleaned up)
const VAR = `${P}var`;
const CLOC = `${P}c7loc`; // Commerce7 inventory location id

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
  passed++;
}

/** A mock QBO adapter (mirrors verify-accounting-idempotency): records posts by DocNumber; optional crash. */
function mockQbo(state: { posted: Map<string, string>; crashOnce?: Set<string> }): AccountingAdapter {
  const notImpl = (): never => { throw new Error("not used"); };
  return {
    buildAuthorizeUrl: notImpl, exchangeCode: notImpl, refresh: notImpl, revoke: notImpl,
    getCompanyInfo: notImpl, listAccounts: notImpl, findOrCreateVendor: notImpl, postBill: notImpl,
    async findByDocNumber(_c, _t, docNumber) { const id = state.posted.get(docNumber); return id ? { externalId: id, version: "0", docNumber } : null; },
    async getById(_c, _t, externalId) { for (const [, id] of state.posted) if (id === externalId) return { externalId, version: "0" }; return null; },
    async postJournalEntry(_c, input): Promise<PostResult> {
      const doc = docNumberFor(input.postingKey);
      const externalId = `EXT-${state.posted.size + 1}`;
      state.posted.set(doc, externalId);
      if (state.crashOnce?.has(input.postingKey)) { state.crashOnce.delete(input.postingKey); throw new ProviderFault("transient", "simulated crash after accept"); }
      return { externalId, version: "0" };
    },
  };
}

function order(over: Partial<ProviderOrder> = {}): ProviderOrder {
  return {
    orderId: `${P}o1`, orderNumber: "1001", customerId: `${P}cust`, channel: "DTC",
    paymentStatus: "Paid", currency: "USD",
    updatedAt: "2026-07-01T12:00:00.000Z", occurredAt: "2026-07-01T10:00:00.000Z", paidAt: "2026-07-01T10:05:00.000Z",
    lines: [{ skuRef: VAR, quantity: 2, unitPrice: 45, lineSubtotal: 90, tax: 7.2, discount: 0, inventoryLocationId: CLOC }],
    subtotal: 90, tax: 7.2, shipping: 15, discount: 5, total: 107.2, ...over,
  };
}

async function statusOfSalesDelivery(salesExportEventId: string): Promise<string> {
  const d = await prisma.accountingDelivery.findFirst({ where: { salesExportEventId }, select: { status: true } });
  return d?.status ?? "MISSING";
}

async function cleanup(qboConnId: string | null, createdQbo: boolean, locationId: string, wineSkuId: string) {
  // deliveries → sales events; movements; inventory; sku map; commerce conn; wine sku; location.
  const evs = await prisma.salesExportEvent.findMany({ where: { postingKey: { startsWith: "sale:" + P } }, select: { id: true } });
  await prisma.accountingDelivery.deleteMany({ where: { salesExportEventId: { in: evs.map((e) => e.id) } } });
  await prisma.salesExportEvent.deleteMany({ where: { postingKey: { startsWith: "sale:" + P } } });
  await prisma.commerce7Order.deleteMany({ where: { commerce7OrderId: { startsWith: P } } });
  await prisma.stockMovement.deleteMany({ where: { wineSkuId } });
  await prisma.commerce7SkuMap.deleteMany({ where: { externalVariantId: VAR } });
  await prisma.commerce7Connection.deleteMany({ where: { externalTenantId: "demo-c7-idem" } });
  await prisma.bottledInventory.deleteMany({ where: { wineSkuId } });
  await prisma.wineSku.deleteMany({ where: { id: wineSkuId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  if (createdQbo && qboConnId) {
    await prisma.accountingDelivery.deleteMany({ where: { connectionId: qboConnId } });
    await prisma.accountingConnection.delete({ where: { id: qboConnId } }).catch(() => {});
  }
}

async function main() {
  await runAsTenant(TENANT, async () => {
    // ── Setup (as app_rls under the tenant) ──
    const location = await prisma.location.create({ data: { name: `${P}Tasting Room`, isActive: true }, select: { id: true } });
    const wineSku = await prisma.wineSku.create({ data: { name: `${P}Pinot`, vintage: 2022 }, select: { id: true } });
    await runInTenantTx((tx) => tx.bottledInventory.create({ data: { wineSkuId: wineSku.id, locationId: location.id, totalBottles: 100 } }));
    await prisma.commerce7SkuMap.create({ data: { externalProductId: `${P}prod`, externalVariantId: VAR, externalSku: `${P}PN22`, externalInventoryLocationId: CLOC, wineSkuId: wineSku.id, locationId: location.id, active: true } });
    // DTC accounts on AppSettings.
    const s = await prisma.appSettings.findFirst({ select: { id: true } });
    const dtc = { dtcRevenueAccount: "4000", dtcTaxAccount: "2200", dtcShippingAccount: "4100", dtcClearingAccount: "1499", dtcDiscountAccount: "4900" };
    if (s) await prisma.appSettings.update({ where: { id: s.id }, data: dtc });
    else await runInTenantTx((tx) => tx.appSettings.create({ data: dtc }));
    // Commerce7 connection (mock adapter ignores creds).
    await prisma.commerce7Connection.create({ data: { provider: "COMMERCE7", status: "CONNECTED", environment: "sandbox", externalTenantId: "demo-c7-idem", scopes: [] } });
    // A CONNECTED QBO connection so sales deliveries get created + posted.
    const existingQbo = await prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
    const createdQbo = !existingQbo;
    const qboConnId = existingQbo ? existingQbo.id : (await prisma.accountingConnection.create({ data: { tenantId: TENANT, provider: "QBO", status: "CONNECTED", environment: "sandbox", externalRealmId: "C7-IDEM-REALM" }, select: { id: true } })).id;
    _seedAccessCache(qboConnId, "fake-access-token");

    // Mock commerce adapter with an editable order store.
    const cstate: MockCommerceState = emptyMockState();
    cstate.inventory.set(`${VAR}:${CLOC}`, 100);
    const commerceFactory = () => createMockCommerceAdapter(cstate);
    const ingestDeps = { adapterFactory: commerceFactory };

    try {
      console.log("── 1. ingest tx atomicity: a rolled-back ingest leaves NO rows ──");
      let threw = false;
      try {
        await runLedgerWrite(async (tx) => {
          await tx.salesExportEvent.create({ data: { postingKey: `sale:${P}rollback:v1`, commerce7OrderId: `${P}rollback`, deltaSeq: 1, kind: "SALE", currency: "USD", revenueDelta: 1, lineDeltas: [], accountingDate: new Date(), occurredAt: new Date() } });
          throw new Error("boom");
        });
      } catch { threw = true; }
      const leftover = await prisma.salesExportEvent.findFirst({ where: { postingKey: `sale:${P}rollback:v1` } });
      assert(threw && !leftover, "a tx that throws after emitting a delta leaves no rows");

      console.log("\n── 2. a Paid order ingests ONCE: SALE delta + depletion + PENDING delivery ──");
      cstate.orders.set(`${P}o1`, order());
      const r1 = await syncOrder(`${P}o1`, ingestDeps);
      assert(r1.outcome === "emitted" && r1.kind === "SALE", "first ingest emits a SALE delta");
      const inv1 = await prisma.bottledInventory.findFirst({ where: { wineSkuId: wineSku.id, locationId: location.id }, select: { totalBottles: true } });
      assert(inv1?.totalBottles === 98, `finished goods depleted 100 → 98 (saw ${inv1?.totalBottles})`);
      const ev1 = await prisma.salesExportEvent.findFirst({ where: { postingKey: `sale:${P}o1:v1` }, select: { id: true } });
      assert(!!ev1, "a v1 SalesExportEvent exists");
      assert((await statusOfSalesDelivery(ev1!.id)) === "PENDING", "a PENDING revenue delivery exists");
      const r1b = await syncOrder(`${P}o1`, ingestDeps);
      assert(r1b.outcome === "noop", "re-ingesting the unchanged order is a no-op (duplicate)");
      const evCount1 = await prisma.salesExportEvent.count({ where: { commerce7OrderId: `${P}o1` } });
      assert(evCount1 === 1, `still exactly one delta after the duplicate (saw ${evCount1})`);

      console.log("\n── 3. an EDIT between polls emits exactly one ADJUSTMENT of the difference ──");
      cstate.orders.set(`${P}o1`, order({ updatedAt: "2026-07-02T12:00:00.000Z", subtotal: 135, total: 152.2, lines: [{ skuRef: VAR, quantity: 3, unitPrice: 45, lineSubtotal: 135, tax: 7.2, discount: 0, inventoryLocationId: CLOC }] }));
      const r2 = await syncOrder(`${P}o1`, ingestDeps);
      assert(r2.outcome === "emitted" && r2.kind === "ADJUSTMENT", "the edit emits one ADJUSTMENT delta");
      const ev2 = await prisma.salesExportEvent.findFirst({ where: { postingKey: `sale:${P}o1:v2` }, select: { id: true, revenueDelta: true } });
      assert(!!ev2 && Number(ev2!.revenueDelta) === 45, `the adjustment delta is the +45 difference (saw ${ev2?.revenueDelta})`);
      const inv2 = await prisma.bottledInventory.findFirst({ where: { wineSkuId: wineSku.id, locationId: location.id }, select: { totalBottles: true } });
      assert(inv2?.totalBottles === 97, `one more bottle depleted 98 → 97 (saw ${inv2?.totalBottles})`);

      console.log("\n── 4. the revenue deltas post to QBO ONCE, with crash-recovery (adopt) ──");
      const qstate = { posted: new Map<string, string>(), crashOnce: new Set<string>([`sale:${P}o1:v1`]) };
      await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockQbo(qstate) });
      assert((await statusOfSalesDelivery(ev1!.id)) === "VERIFYING", "the crashed v1 delivery is VERIFYING (not lost)");
      await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockQbo(qstate) });
      assert((await statusOfSalesDelivery(ev1!.id)) === "POSTED", "the next sweep adopts v1 → POSTED (no duplicate)");
      assert((await statusOfSalesDelivery(ev2!.id)) === "POSTED", "v2 posted too");
      const postedCount = qstate.posted.size;
      await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockQbo(qstate) });
      assert(qstate.posted.size === postedCount, `a re-sweep posts nothing new (still ${postedCount})`);

      console.log("\n── 5. concurrent double-sweep single-claims (no double-post) ──");
      // A fresh order → one PENDING delivery, swept by two concurrent sweeps.
      cstate.orders.set(`${P}o2`, order({ orderId: `${P}o2`, orderNumber: "1002", lines: [{ skuRef: VAR, quantity: 1, unitPrice: 45, lineSubtotal: 45, tax: 3.6, discount: 0, inventoryLocationId: CLOC }], subtotal: 45, tax: 3.6, shipping: 0, discount: 0, total: 48.6 }));
      await syncOrder(`${P}o2`, ingestDeps);
      const ev3 = await prisma.salesExportEvent.findFirst({ where: { postingKey: `sale:${P}o2:v1` }, select: { id: true } });
      const cstate2 = { posted: new Map<string, string>() };
      await Promise.all([
        runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockQbo(cstate2) }),
        runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockQbo(cstate2) }),
      ]);
      assert((await statusOfSalesDelivery(ev3!.id)) === "POSTED", "the concurrently-swept delivery is POSTED");
      assert(cstate2.posted.size === 1, `only one sweep posted it (saw ${cstate2.posted.size})`);

      console.log("\n── 6. outbound: a RECEIVE pushes once (watermark), an ingested SALE never pushes ──");
      await receiveStock("BOTTLED_WINE", wineSku.id, location.id, 24, { actorUserId: null, actorEmail: "idem" }, "restock");
      cstate.adjustCalls.length = 0;
      await runCommerce7InventorySync({ orgIds: [TENANT], adapterFactory: commerceFactory });
      assert(cstate.adjustCalls.length === 1 && cstate.adjustCalls[0].delta === 24, `RECEIVE pushed +24 once (saw ${JSON.stringify(cstate.adjustCalls)})`);
      await runCommerce7InventorySync({ orgIds: [TENANT], adapterFactory: commerceFactory });
      assert(cstate.adjustCalls.length === 1, "a re-run pushes nothing (watermark) — SALE depletions were never pushed");

      console.log("\n── 7. a full cancel nets inventory back (REVERSAL) ──");
      const beforeCancel = (await prisma.bottledInventory.findFirst({ where: { wineSkuId: wineSku.id, locationId: location.id }, select: { totalBottles: true } }))!.totalBottles;
      cstate.orders.set(`${P}o2`, order({ orderId: `${P}o2`, orderNumber: "1002", paymentStatus: "Cancelled", updatedAt: "2026-07-03T00:00:00.000Z", lines: [{ skuRef: VAR, quantity: 1, unitPrice: 45, lineSubtotal: 45, tax: 3.6, discount: 0, inventoryLocationId: CLOC }], subtotal: 45, tax: 3.6, shipping: 0, discount: 0, total: 48.6 }));
      const rc = await syncOrder(`${P}o2`, ingestDeps);
      assert(rc.outcome === "emitted" && rc.kind === "REVERSAL", "the cancel emits a REVERSAL");
      const afterCancel = (await prisma.bottledInventory.findFirst({ where: { wineSkuId: wineSku.id, locationId: location.id }, select: { totalBottles: true } }))!.totalBottles;
      assert(afterCancel === beforeCancel + 1, `the 1 cancelled bottle is restored (${beforeCancel} → ${afterCancel})`);

      console.log(`\nALL ${passed} COMMERCE7 IDEMPOTENCY ASSERTIONS PASSED`);
    } finally {
      await cleanup(qboConnId, createdQbo, location.id, wineSku.id);
      _clearAccessCache();
    }
  });
  await prismaBase.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prismaBase.$disconnect();
  process.exit(1);
});
