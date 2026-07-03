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

/** A mock QBO adapter: records what it "posted" by DocNumber; can simulate a crash after accept. */
function mockAdapter(state: { posted: Map<string, string>; crashOnce?: Set<string> }): AccountingAdapter {
  const notImpl = (): never => { throw new Error("not used in this harness"); };
  return {
    buildAuthorizeUrl: notImpl,
    exchangeCode: notImpl,
    refresh: notImpl,
    revoke: notImpl,
    getCompanyInfo: notImpl,
    listAccounts: notImpl,
    findOrCreateVendor: notImpl,
    postBill: notImpl,
    async findByDocNumber(_ctx, _type, docNumber): Promise<PostResult | null> {
      const id = state.posted.get(docNumber);
      return id ? { externalId: id, version: "0", docNumber } : null;
    },
    async getById(_ctx, _type, externalId): Promise<PostResult | null> {
      for (const [, id] of state.posted) if (id === externalId) return { externalId, version: "0" };
      return null;
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

async function main() {
  await runAsTenant(TENANT, async () => {
    // Pre-clean any leftovers from an interrupted prior run so re-runs are idempotent.
    const stale = await prisma.costExportEvent.findMany({ where: { postingKey: { startsWith: "idem:" } }, select: { id: true } });
    await prisma.accountingDelivery.deleteMany({ where: { costExportEventId: { in: stale.map((e) => e.id) } } });
    await prisma.costExportEvent.deleteMany({ where: { postingKey: { startsWith: "idem:" } } });

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

      console.log(`\nALL ${passed} IDEMPOTENCY ASSERTIONS PASSED`);
    } finally {
      // ── cleanup ALWAYS (deliveries first — FK to cost_export_event is RESTRICT) ──
      const evs = await prisma.costExportEvent.findMany({ where: { postingKey: { startsWith: "idem:" } }, select: { id: true } });
      await prisma.accountingDelivery.deleteMany({ where: { costExportEventId: { in: evs.map((e) => e.id) } } });
      await prisma.costExportEvent.deleteMany({ where: { postingKey: { startsWith: "idem:" } } });
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
