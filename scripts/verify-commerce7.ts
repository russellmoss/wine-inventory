/**
 * Phase 16 Unit 11 — the end-to-end Commerce7 proof on Demo Winery with mock adapters. Exercises the
 * FULL loop the idempotency harness doesn't cover at the edges: nonce-bound connect → confirm (webhook
 * registered) → ingest a paid order (SALE + deplete) → post the revenue delta to QBO → push an ERP
 * increase → refund reversal → per-channel margin → disconnect (webhook deleted). Offline + deterministic.
 *
 *   npm run verify:commerce7
 *
 * Then, once Unit 0 delivers sandbox keys, a live smoke against the real Commerce7 sandbox tenant.
 */
process.env.COMMERCE7_APP_ID = process.env.COMMERCE7_APP_ID || "test-app";
process.env.COMMERCE7_SECRET_KEY = process.env.COMMERCE7_SECRET_KEY || "test-secret";
process.env.COMMERCE7_WEBHOOK_SECRET = process.env.COMMERCE7_WEBHOOK_SECRET || "test-webhook-secret";
process.env.COMMERCE7_WEBHOOK_BASE_URL = process.env.COMMERCE7_WEBHOOK_BASE_URL || "https://app.example.com";
process.env.COMMERCE7_INSTALL_URL = process.env.COMMERCE7_INSTALL_URL || "https://demo.commerce7.com/install";

import { prisma, prismaBase } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { beginInstall, consumeInstallNonce, stageInstall, confirmInstall, disconnect } from "@/lib/commerce/connection";
import { syncOrder } from "@/lib/commerce/ingest";
import { runAccountingPostSweep } from "@/lib/accounting/post-sweep";
import { runCommerce7InventorySync } from "@/lib/commerce/inventory-sync";
import { getDtcMargin } from "@/lib/commerce/margin";
import { receiveStock } from "@/lib/stock/movements";
import { _seedAccessCache, _clearAccessCache } from "@/lib/accounting/token";
import { docNumberFor } from "@/lib/accounting/qbo/client";
import { type AccountingAdapter, type PostResult } from "@/lib/accounting/adapter";
import { createMockCommerceAdapter, emptyMockState, type MockCommerceState } from "@/lib/commerce/mock";
import type { ProviderOrder } from "@/lib/commerce/adapter";

const TENANT = "org_demo_winery";
const P = "c7e2e_";
const VAR = `${P}var`;
const CLOC = `${P}c7loc`;

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
  passed++;
}

function mockQbo(state: { posted: Map<string, string> }): AccountingAdapter {
  const notImpl = (): never => { throw new Error("not used"); };
  return {
    buildAuthorizeUrl: notImpl, exchangeCode: notImpl, refresh: notImpl, revoke: notImpl,
    getCompanyInfo: notImpl, listAccounts: notImpl, findOrCreateVendor: notImpl, postBill: notImpl,
    async findByDocNumber(_c, _t, docNumber) { const id = state.posted.get(docNumber); return id ? { externalId: id, version: "0", docNumber } : null; },
    async getById() { return null; },
    async postJournalEntry(_c, input): Promise<PostResult> { const doc = docNumberFor(input.postingKey); const id = `EXT-${state.posted.size + 1}`; state.posted.set(doc, id); return { externalId: id, version: "0" }; },
  };
}

function order(over: Partial<ProviderOrder> = {}): ProviderOrder {
  return {
    orderId: `${P}o1`, orderNumber: "9001", customerId: `${P}cust`, channel: "DTC", paymentStatus: "Paid", currency: "USD",
    updatedAt: "2026-07-01T12:00:00.000Z", occurredAt: "2026-07-01T10:00:00.000Z", paidAt: "2026-07-01T10:05:00.000Z",
    lines: [{ skuRef: VAR, quantity: 2, unitPrice: 45, lineSubtotal: 90, tax: 7.2, discount: 0, inventoryLocationId: CLOC }],
    subtotal: 90, tax: 7.2, shipping: 15, discount: 5, total: 107.2, ...over,
  };
}

async function main() {
  await runAsTenant(TENANT, async () => {
    const location = await prisma.location.create({ data: { name: `${P}Tasting Room`, isActive: true }, select: { id: true } });
    const wineSku = await prisma.wineSku.create({ data: { name: `${P}Pinot`, vintage: 2022 }, select: { id: true } });
    await runInTenantTx((tx) => tx.bottledInventory.create({ data: { wineSkuId: wineSku.id, locationId: location.id, totalBottles: 50 } }));
    await prisma.commerce7SkuMap.create({ data: { externalProductId: `${P}prod`, externalVariantId: VAR, externalSku: `${P}PN22`, externalInventoryLocationId: CLOC, wineSkuId: wineSku.id, locationId: location.id, active: true } });
    // Phase-8 COGS: a bottling cost snapshot so margin has a COGS to join.
    const run = await prisma.bottlingRun.create({ data: { date: new Date(), wineSkuId: wineSku.id, bottlesProduced: 100, volumeConsumedL: 75, destinationLocationId: location.id, createdByEmail: "e2e" }, select: { id: true } });
    await prisma.bottlingCostSnapshot.create({ data: { runId: run.id, skuId: wineSku.id, bottledAt: new Date(), goodBottles: 100, totalRunCost: 800, costPerBottle: 8, componentBreakdown: {} } });
    const s = await prisma.appSettings.findFirst({ select: { id: true } });
    const dtc = { dtcRevenueAccount: "4000", dtcTaxAccount: "2200", dtcShippingAccount: "4100", dtcClearingAccount: "1499", dtcDiscountAccount: "4900" };
    if (s) await prisma.appSettings.update({ where: { id: s.id }, data: dtc }); else await runInTenantTx((tx) => tx.appSettings.create({ data: dtc }));
    const existingQbo = await prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
    const createdQbo = !existingQbo;
    const qboConnId = existingQbo ? existingQbo.id : (await prisma.accountingConnection.create({ data: { tenantId: TENANT, provider: "QBO", status: "CONNECTED", environment: "sandbox", externalRealmId: "C7-E2E-REALM" }, select: { id: true } })).id;
    _seedAccessCache(qboConnId, "fake");

    const cstate: MockCommerceState = emptyMockState();
    cstate.inventory.set(`${VAR}:${CLOC}`, 50);
    const commerceFactory = () => createMockCommerceAdapter(cstate);

    try {
      console.log("── connect: nonce-bound install → confirm → CONNECTED + webhook ──");
      const { setupUrl } = await beginInstall({ tenantId: TENANT, userId: "e2e-admin", sessionId: "sess" });
      const nonce = new URL(setupUrl).searchParams.get("state")!;
      await consumeInstallNonce({ tenantId: TENANT, rawState: nonce, userId: "e2e-admin" });
      await stageInstall({ tenantId: TENANT, externalTenantId: "demo-e2e", userId: "e2e-admin" });
      await confirmInstall({ tenantId: TENANT, adapterFactory: commerceFactory });
      const conn = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7" }, select: { status: true, webhookId: true } });
      assert(conn?.status === "CONNECTED" && !!conn.webhookId, "connection is CONNECTED with a registered webhook");
      let replayed = false;
      try { await consumeInstallNonce({ tenantId: TENANT, rawState: nonce, userId: "e2e-admin" }); } catch { replayed = true; }
      assert(replayed, "the install nonce is single-use (replay rejected)");

      console.log("\n── ingest a paid order → SALE + deplete + revenue post ──");
      cstate.orders.set(`${P}o1`, order());
      const r1 = await syncOrder(`${P}o1`, { adapterFactory: commerceFactory });
      assert(r1.outcome === "emitted" && r1.kind === "SALE", "paid order ingests as a SALE");
      const inv = await prisma.bottledInventory.findFirst({ where: { wineSkuId: wineSku.id }, select: { totalBottles: true } });
      assert(inv?.totalBottles === 48, `finished goods depleted 50 → 48 (saw ${inv?.totalBottles})`);
      const qstate = { posted: new Map<string, string>() };
      await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockQbo(qstate) });
      const ev = await prisma.salesExportEvent.findFirst({ where: { postingKey: `sale:${P}o1:v1` }, select: { id: true } });
      const del = await prisma.accountingDelivery.findFirst({ where: { salesExportEventId: ev!.id }, select: { status: true } });
      assert(del?.status === "POSTED", "the revenue delta posted to QuickBooks");

      console.log("\n── outbound: a RECEIVE pushes an increase to Commerce7 ──");
      await receiveStock("BOTTLED_WINE", wineSku.id, location.id, 12, { actorUserId: null, actorEmail: "e2e" }, "restock");
      cstate.adjustCalls.length = 0;
      await runCommerce7InventorySync({ orgIds: [TENANT], adapterFactory: commerceFactory });
      assert(cstate.adjustCalls.some((c) => c.delta === 12), "the +12 RECEIVE was pushed to Commerce7");

      console.log("\n── margin: per-SKU × channel from ingested revenue × Phase-8 COGS ──");
      const margin = await getDtcMargin();
      const row = margin.rows.find((r) => r.channel === "DTC" && r.unitsSold === 2);
      // netRevenue = 90 subtotal − 5 order discount = 85; COGS = 8/bottle × 2 = 16; margin = 69.
      assert(!!row && row.netRevenue === 85 && row.cogs === 16 && row.margin === 69, `DTC margin: rev 85 − COGS 16 = 69 (saw ${JSON.stringify(row)})`);
      assert(/gross of/i.test(margin.caveat), "the gross-of-fees caveat is present");

      console.log("\n── refund reversal nets margin down ──");
      cstate.orders.set(`${P}o1`, order({ paymentStatus: "Cancelled", updatedAt: "2026-07-02T00:00:00.000Z" }));
      const rc = await syncOrder(`${P}o1`, { adapterFactory: commerceFactory });
      assert(rc.kind === "REVERSAL", "the cancel emits a REVERSAL");
      const margin2 = await getDtcMargin();
      const row2 = margin2.rows.find((r) => r.channel === "DTC");
      assert(!row2 || row2.netRevenue === 0, `after the full cancel the DTC margin nets to zero revenue (saw ${JSON.stringify(row2)})`);

      console.log("\n── disconnect: webhook deleted, DISCONNECTED ──");
      await disconnect({ tenantId: TENANT, adapterFactory: commerceFactory });
      const after = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7" }, select: { status: true, webhookId: true } });
      assert(after?.status === "DISCONNECTED" && !after.webhookId, "connection is DISCONNECTED and the webhook id is cleared");

      console.log(`\nALL ${passed} COMMERCE7 END-TO-END ASSERTIONS PASSED`);
    } finally {
      const evs = await prisma.salesExportEvent.findMany({ where: { postingKey: { startsWith: "sale:" + P } }, select: { id: true } });
      await prisma.accountingDelivery.deleteMany({ where: { salesExportEventId: { in: evs.map((e) => e.id) } } });
      await prisma.salesExportEvent.deleteMany({ where: { postingKey: { startsWith: "sale:" + P } } });
      await prisma.commerce7Order.deleteMany({ where: { commerce7OrderId: { startsWith: P } } });
      await prisma.commerce7Connection.deleteMany({ where: { externalTenantId: { in: ["demo-e2e"] } } });
      await prisma.commerce7SkuMap.deleteMany({ where: { externalVariantId: VAR } });
      await prisma.stockMovement.deleteMany({ where: { wineSkuId: wineSku.id } });
      await prisma.bottlingCostSnapshot.deleteMany({ where: { skuId: wineSku.id } });
      await prisma.bottlingRun.deleteMany({ where: { wineSkuId: wineSku.id } });
      await prisma.bottledInventory.deleteMany({ where: { wineSkuId: wineSku.id } });
      await prisma.wineSku.deleteMany({ where: { id: wineSku.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
      await prisma.commerce7InstallState.deleteMany({ where: { userId: "e2e-admin" } });
      if (createdQbo) { await prisma.accountingDelivery.deleteMany({ where: { connectionId: qboConnId } }); await prisma.accountingConnection.delete({ where: { id: qboConnId } }).catch(() => {}); }
      _clearAccessCache();
    }
  });
  await prismaBase.$disconnect();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await prismaBase.$disconnect(); process.exit(1); });
