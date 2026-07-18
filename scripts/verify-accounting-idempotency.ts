/**
 * Phase 15 Unit 13 — prove EXACTLY-ONCE under the failure modes council flagged, offline + deterministic
 * (a mock QBO adapter + a seeded access token — no live sandbox, no operator setup). All in Demo Winery.
 *
 *   npm run verify:accounting-idempotency
 *
 * Covers: rolled-back emit leaves NO rows; a normal sweep posts each delivery once; a crash BETWEEN
 * QBO-accept and finalize → VERIFYING → next sweep query-before-posts and ADOPTS (no duplicate);
 * concurrent double-sweep single-claims each row (FOR UPDATE SKIP LOCKED); a backlog larger than one
 * batch drains over ticks with no double-post.
 */
import { prisma, prismaBase } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAccountingPostSweep } from "@/lib/accounting/post-sweep";
import { _seedAccessCache, _clearAccessCache } from "@/lib/accounting/token";
import { ProviderFault, type AccountingAdapter, type PostResult } from "@/lib/accounting/adapter";

const TENANT = "org_demo_winery";
process.env.POST_BATCH_PER_TENANT = "3"; // small batch so the backlog test spans ticks

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
  passed++;
}

type MockState = {
  posted: Map<string, string>;
  crashOnce?: Set<string>;
  bills?: Array<Record<string, unknown>>; // Plan 073: captured Bill payloads (currency assertions)
  vendorCalls?: Array<{ name: string; currency?: string }>; // Plan 073: vendor resolutions
  billPayments?: Map<string, string>; // Plan 076: DocNumber → BillPayment externalId
  billBalances?: Map<string, number>; // Plan 076: bill externalId → outstanding balance (0 once paid)
  billPaymentPayloads?: Array<Record<string, unknown>>; // Plan 076: captured BillPayment payloads
};

/** A mock QBO adapter: records what it "posted" by DocNumber; can simulate a crash after accept. Plan 073
 *  implements the Bill + vendor path (previously notImpl) so the Bill idempotency proof can run offline. */
function mockAdapter(state: MockState): AccountingAdapter {
  const notImpl = (): never => { throw new Error("not used in this harness"); };
  return {
    buildAuthorizeUrl: notImpl,
    exchangeCode: notImpl,
    refresh: notImpl,
    revoke: notImpl,
    getCompanyInfo: notImpl,
    listAccounts: notImpl,
    async findOrCreateVendor(_ctx, name, currency): Promise<string> {
      state.vendorCalls?.push({ name, currency });
      // Distinct id per (name, currency) — a currency-scoped vendor is a distinct QBO vendor (council #4).
      return currency ? `VENDOR-${name}-${currency}` : `VENDOR-${name}`;
    },
    async postBill(_ctx, payload, _requestId): Promise<PostResult> {
      const docNumber = String((payload as { DocNumber?: string }).DocNumber ?? "");
      state.bills?.push(payload);
      const externalId = `BILL-${state.posted.size + 1}`;
      state.posted.set(docNumber, externalId); // keyed by DocNumber, so findByDocNumber adopts on resume
      if (state.crashOnce?.has(docNumber)) {
        state.crashOnce.delete(docNumber);
        throw new ProviderFault("transient", "simulated crash after QBO accepts the Bill, before finalize");
      }
      return { externalId, version: "0" };
    },
    async findByDocNumber(_ctx, _type, docNumber): Promise<PostResult | null> {
      const id = state.posted.get(docNumber) ?? state.billPayments?.get(docNumber);
      return id ? { externalId: id, version: "0", docNumber } : null;
    },
    async getById(_ctx, _type, externalId): Promise<PostResult | null> {
      for (const [, id] of state.posted) if (id === externalId) return { externalId, version: "0" };
      return null;
    },
    // Plan 076: record a BillPayment (keyed by DocNumber → adopt on resume) and zero the linked Bill's balance.
    async postBillPayment(_ctx, payload, _requestId): Promise<PostResult> {
      const docNumber = String((payload as { DocNumber?: string }).DocNumber ?? "");
      state.billPaymentPayloads?.push(payload);
      const externalId = `BP-${(state.billPayments?.size ?? 0) + 1}`;
      state.billPayments?.set(docNumber, externalId);
      const linked = (payload as { Line?: Array<{ LinkedTxn?: Array<{ TxnId?: string }> }> }).Line?.[0]?.LinkedTxn?.[0]?.TxnId;
      if (linked && state.billBalances) state.billBalances.set(String(linked), 0);
      return { externalId, version: "0" };
    },
    async getBillBalance(_ctx, externalId): Promise<number | null> {
      const isPosted = [...state.posted.values()].includes(externalId);
      if (!isPosted) return null;
      return state.billBalances?.get(externalId) ?? 0;
    },
    async postJournalEntry(_ctx, input): Promise<PostResult> {
      const doc = input.postingKey; // harness keys posted by postingKey for readability
      // QBO accepts (record it) — then, if flagged, our process "crashes" before finalize.
      const externalId = `EXT-${state.posted.size + 1}`;
      state.posted.set(docFor(input), externalId);
      if (state.crashOnce?.has(doc)) {
        state.crashOnce.delete(doc);
        throw new ProviderFault("transient", "simulated crash after QBO accept, before finalize");
      }
      return { externalId, version: "0" };
    },
  };
}

// The poster keys DocNumber via docNumberFor(postingKey); mirror that so findByDocNumber matches.
import { docNumberFor } from "@/lib/accounting/qbo/client";
function docFor(input: { postingKey: string }): string {
  return docNumberFor(input.postingKey);
}

async function seedDelivery(connectionId: string, key: string): Promise<string> {
  return runInTenantTx(async (tx) => {
    const ev = await tx.costExportEvent.create({
      data: { postingKey: key, sourceType: "SNAPSHOT", component: "FRUIT", amount: 100, debitAccount: "5000", creditAccount: "1400", currency: "USD" },
      select: { id: true },
    });
    const del = await tx.accountingDelivery.create({
      data: { costExportEventId: ev.id, connectionId, objectType: "JournalEntry", status: "PENDING" },
      select: { id: true },
    });
    return del.id;
  });
}

async function statusOf(id: string): Promise<string> {
  const d = await prisma.accountingDelivery.findUnique({ where: { id }, select: { status: true } });
  return d?.status ?? "MISSING";
}

/** Plan 073: seed a FOREIGN (EUR) A/P Bill delivery — a vendor + an ApExportEvent (foreign amount + rate) +
 *  a PENDING Bill delivery — so the sweep drives the Bill path through the mock adapter. */
async function seedBillDelivery(connectionId: string, key: string): Promise<{ deliveryId: string; vendorId: string }> {
  return runInTenantTx(async (tx) => {
    const vendor = await tx.vendor.create({ data: { name: `IDEM Bill Vendor ${key}`, currency: "EUR" }, select: { id: true } });
    const ev = await tx.apExportEvent.create({
      data: { postingKey: key, amount: 100, currency: "EUR", exchangeRate: 1.1, debitAccount: "1300-Inventory", creditAccount: "2000-AP", receivedAt: new Date(), vendorId: vendor.id },
      select: { id: true },
    });
    const del = await tx.accountingDelivery.create({
      data: { apExportEventId: ev.id, connectionId, objectType: "Bill", status: "PENDING" },
      select: { id: true },
    });
    return { deliveryId: del.id, vendorId: vendor.id };
  });
}

/** Plan 076: seed a home-currency (USD) aggregate invoice bill marked PAID — a vendor + a PAID ApExportEvent
 *  (ingestedInvoiceId + paidFromAccount) + a PENDING Bill delivery — so the sweep posts the Bill then records
 *  a BillPayment. */
async function seedPaidBillDelivery(connectionId: string, key: string, invoiceId: string): Promise<{ deliveryId: string; eventId: string }> {
  return runInTenantTx(async (tx) => {
    const vendor = await tx.vendor.create({ data: { name: `IDEM Bill Vendor ${key}`, currency: "USD" }, select: { id: true } });
    const ev = await tx.apExportEvent.create({
      data: {
        postingKey: key, ingestedInvoiceId: invoiceId, amount: 60, currency: "USD",
        debitAccount: "1300-Inventory", creditAccount: "2000-AP", receivedAt: new Date(), vendorId: vendor.id,
        billLinesJson: [{ debitAccount: "1300-Inventory", amount: 60, description: "Paid line" }],
        paymentStatus: "PAID", paidFromAccount: "1010-Bank", paidAt: new Date(),
      },
      select: { id: true },
    });
    const del = await tx.accountingDelivery.create({ data: { apExportEventId: ev.id, connectionId, objectType: "Bill", status: "PENDING" }, select: { id: true } });
    return { deliveryId: del.id, eventId: ev.id };
  });
}

async function main() {
  await runAsTenant(TENANT, async () => {
    // Pre-clean any leftovers from an interrupted prior run so re-runs are idempotent.
    const stale = await prisma.costExportEvent.findMany({ where: { postingKey: { startsWith: "idem:" } }, select: { id: true } });
    await prisma.accountingDelivery.deleteMany({ where: { costExportEventId: { in: stale.map((e) => e.id) } } });
    await prisma.costExportEvent.deleteMany({ where: { postingKey: { startsWith: "idem:" } } });
    // Plan 073: the same for the Bill block's A/P events + deliveries + throwaway EUR vendors.
    const staleAp = await prisma.apExportEvent.findMany({ where: { postingKey: { startsWith: "idem:" } }, select: { id: true } });
    await prisma.accountingDelivery.deleteMany({ where: { apExportEventId: { in: staleAp.map((e) => e.id) } } });
    await prisma.apExportEvent.deleteMany({ where: { postingKey: { startsWith: "idem:" } } });
    await prisma.vendor.deleteMany({ where: { name: { startsWith: "IDEM Bill Vendor" } } });

    // Reuse a CONNECTED connection READ-ONLY if one exists (never modify it); else stand up a throwaway
    // CONNECTED row (the DB CHECK allows CONNECTED with null tokens; the mock adapter never uses a real
    // token). A created test row is ALWAYS deleted in the finally below, even if an assertion throws.
    const existing = await prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
    const createdConn = !existing;
    const connectionId = existing
      ? existing.id
      : (await prisma.accountingConnection.create({
          data: { tenantId: TENANT, provider: "QBO", status: "CONNECTED", environment: "sandbox", externalRealmId: "IDEMPOTENCY-TEST-REALM" },
          select: { id: true },
        })).id;
    _seedAccessCache(connectionId, "fake-access-token");

    // Plan 073: for the Bill block, pin the connection to a USD home + Multicurrency ON (save prior + restore
    // in finally) so the EUR bill posts deterministically regardless of the reused connection's real config.
    const priorConn = await prisma.accountingConnection.findUnique({ where: { id: connectionId }, select: { homeCurrency: true, multiCurrencyEnabled: true } });
    await prisma.accountingConnection.update({ where: { id: connectionId }, data: { homeCurrency: "USD", multiCurrencyEnabled: true } });

    try {
    console.log("── 1. transactional outbox atomicity: a rolled-back emit leaves NO rows ──");
    let threw = false;
    try {
      await runInTenantTx(async (tx) => {
        await tx.costExportEvent.create({ data: { postingKey: "idem:rollback", sourceType: "SNAPSHOT", component: "FRUIT", amount: 1, debitAccount: "5000", creditAccount: "1400", currency: "USD" } });
        throw new Error("boom");
      });
    } catch { threw = true; }
    const leftover = await prisma.costExportEvent.findFirst({ where: { postingKey: "idem:rollback" }, select: { id: true } });
    assert(threw && !leftover, "a tx that throws after emitting leaves neither event nor delivery");

    console.log("\n── 2. a normal sweep posts each PENDING delivery exactly once ──");
    const d1 = await seedDelivery(connectionId, "idem:once:1");
    const state = { posted: new Map<string, string>(), crashOnce: new Set<string>() };
    const factory = () => mockAdapter(state);
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: factory });
    assert((await statusOf(d1)) === "POSTED", "delivery is POSTED after one sweep");
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: factory });
    assert(state.posted.size === 1, `re-sweep posts nothing new (posted count still ${state.posted.size})`);

    console.log("\n── 3. crash BETWEEN accept and finalize → VERIFYING → adopt (no duplicate) ──");
    const d2 = await seedDelivery(connectionId, "idem:crash:1");
    const crashState = { posted: new Map<string, string>(), crashOnce: new Set<string>(["idem:crash:1"]) };
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(crashState) });
    assert((await statusOf(d2)) === "VERIFYING", "after the simulated crash the delivery is VERIFYING (not lost)");
    assert(crashState.posted.size === 1, "QBO recorded exactly one object during the crash attempt");
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(crashState) });
    assert((await statusOf(d2)) === "POSTED", "resume adopts the existing object → POSTED");
    assert(crashState.posted.size === 1, "resume did NOT create a duplicate (still one object)");

    console.log("\n── 4. concurrent double-sweep single-claims a row (FOR UPDATE SKIP LOCKED) ──");
    const d3 = await seedDelivery(connectionId, "idem:concurrent:1");
    const cState = { posted: new Map<string, string>() };
    await Promise.all([
      runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(cState) }),
      runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(cState) }),
    ]);
    assert((await statusOf(d3)) === "POSTED", "the row is POSTED");
    assert(cState.posted.size === 1, "only ONE sweep claimed + posted it (no double-post)");

    console.log("\n── 5. backlog > one batch drains over ticks, no double-post ──");
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await seedDelivery(connectionId, `idem:backlog:${i}`));
    const bState = { posted: new Map<string, string>() };
    // POST_BATCH_PER_TENANT=3 → needs 3 ticks to drain 7.
    for (let tick = 0; tick < 3; tick++) await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(bState) });
    const statuses = await Promise.all(ids.map(statusOf));
    assert(statuses.every((s) => s === "POSTED"), `all 7 drained to POSTED over 3 ticks (${statuses.join(",")})`);
    assert(bState.posted.size === 7, `exactly 7 objects posted, none twice (got ${bState.posted.size})`);

    console.log("\n── 6. Plan 073: a FOREIGN (EUR) A/P Bill posts once, currency-correct, and adopts on resume ──");
    // 6a: a normal sweep posts the EUR bill exactly once, with a EUR vendor + CurrencyRef + ExchangeRate.
    const b1 = await seedBillDelivery(connectionId, "idem:bill:1");
    const billState: MockState = { posted: new Map(), crashOnce: new Set(), bills: [], vendorCalls: [] };
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(billState) });
    assert((await statusOf(b1.deliveryId)) === "POSTED", "EUR bill delivery is POSTED after one sweep");
    assert(billState.bills!.length === 1, "exactly one Bill was posted");
    assert(billState.vendorCalls!.some((v) => v.currency === "EUR"), "vendor was resolved currency-scoped (EUR)");
    const billPayload = billState.bills![0] as { CurrencyRef?: { value: string }; ExchangeRate?: number; Line: Array<{ Amount: number }> };
    assert(billPayload.CurrencyRef?.value === "EUR", "Bill payload carries CurrencyRef EUR");
    assert(billPayload.ExchangeRate === 1.1, `Bill payload carries ExchangeRate 1.1 (got ${billPayload.ExchangeRate})`);
    assert(billPayload.Line[0].Amount === 100, "Bill line amount is the FOREIGN amount (100 EUR)");
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(billState) });
    assert(billState.bills!.length === 1, "re-sweep posts no duplicate Bill");

    // 6b: crash between accept and finalize → VERIFYING → adopt (no duplicate Bill).
    const b2 = await seedBillDelivery(connectionId, "idem:bill:2");
    const crashDoc = docNumberFor("idem:bill:2");
    const billCrash: MockState = { posted: new Map(), crashOnce: new Set([crashDoc]), bills: [], vendorCalls: [] };
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(billCrash) });
    assert((await statusOf(b2.deliveryId)) === "VERIFYING", "crashed EUR bill is VERIFYING (not lost)");
    assert(billCrash.posted.size === 1, "QBO recorded exactly one Bill during the crash attempt");
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(billCrash) });
    assert((await statusOf(b2.deliveryId)) === "POSTED", "resume adopts the existing Bill → POSTED");
    assert(billCrash.posted.size === 1, "resume created NO duplicate Bill");

    console.log("\n── 7. Plan 073 hardening: a base-currency ≠ QBO-home-currency mismatch WITHHELDs (never mis-posts) ──");
    // Demo Winery's base currency is USD; pretend this QBO company's home is NZD → the pinned rate's base
    // would not match QBO's home, so the bill must be WITHHELD (not posted at the wrong currency/rate).
    await prisma.accountingConnection.update({ where: { id: connectionId }, data: { homeCurrency: "NZD" } });
    const b3 = await seedBillDelivery(connectionId, "idem:bill:3");
    const mmState: MockState = { posted: new Map(), bills: [], vendorCalls: [] };
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(mmState) });
    assert((await statusOf(b3.deliveryId)) === "WITHHELD", "base≠home bill is WITHHELD, not POSTED");
    assert(mmState.bills!.length === 0, "no Bill was posted to QBO on a currency mismatch");
    await prisma.accountingConnection.update({ where: { id: connectionId }, data: { homeCurrency: "USD" } }); // restore

    console.log("\n── 8. Plan 076: a PAID invoice posts the Bill AND records a BillPayment exactly once ──");
    const paid1 = await seedPaidBillDelivery(connectionId, "idem:apinv:paid:1", "idem-inv-paid-1");
    const paidState: MockState = { posted: new Map(), bills: [], vendorCalls: [], billPayments: new Map(), billBalances: new Map(), billPaymentPayloads: [] };
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(paidState) });
    assert((await statusOf(paid1.deliveryId)) === "POSTED", "paid invoice's Bill is POSTED");
    assert(paidState.billPayments!.size === 1, "exactly one BillPayment recorded for the paid invoice");
    const evAfter = await prisma.apExportEvent.findUnique({ where: { id: paid1.eventId }, select: { paymentExternalId: true } });
    assert(!!evAfter?.paymentExternalId, "aggregate event stamped with the QBO BillPayment id");
    const bp = paidState.billPaymentPayloads![0] as { Line: Array<{ LinkedTxn: Array<{ TxnId: string; TxnType: string }> }>; TotalAmt: number };
    assert(bp.Line[0].LinkedTxn[0].TxnType === "Bill" && bp.TotalAmt === 60, "BillPayment links the Bill for the full amount (60)");
    await runAccountingPostSweep({ orgIds: [TENANT], adapterFactory: () => mockAdapter(paidState) });
    assert(paidState.billPayments!.size === 1, "re-sweep records NO duplicate BillPayment (exactly-once)");

      console.log(`\nALL ${passed} IDEMPOTENCY ASSERTIONS PASSED`);
    } finally {
      // ── cleanup ALWAYS (deliveries first — FK to the event rows is RESTRICT) ──
      const evs = await prisma.costExportEvent.findMany({ where: { postingKey: { startsWith: "idem:" } }, select: { id: true } });
      await prisma.accountingDelivery.deleteMany({ where: { costExportEventId: { in: evs.map((e) => e.id) } } });
      await prisma.costExportEvent.deleteMany({ where: { postingKey: { startsWith: "idem:" } } });
      // Plan 073: the Bill block's A/P events + deliveries + throwaway EUR vendors.
      const apEvs = await prisma.apExportEvent.findMany({ where: { postingKey: { startsWith: "idem:" } }, select: { id: true } });
      await prisma.accountingDelivery.deleteMany({ where: { apExportEventId: { in: apEvs.map((e) => e.id) } } });
      await prisma.apExportEvent.deleteMany({ where: { postingKey: { startsWith: "idem:" } } });
      await prisma.vendor.deleteMany({ where: { name: { startsWith: "IDEM Bill Vendor" } } });
      // Restore the connection's currency config (we pinned it for the Bill block).
      await prisma.accountingConnection.update({ where: { id: connectionId }, data: { homeCurrency: priorConn?.homeCurrency ?? null, multiCurrencyEnabled: priorConn?.multiCurrencyEnabled ?? null } }).catch(() => {});
      if (createdConn) {
        await prisma.accountingDelivery.deleteMany({ where: { connectionId } });
        await prisma.accountingConnection.delete({ where: { id: connectionId } }).catch(() => {});
      }
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
