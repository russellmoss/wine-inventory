import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { GLOBAL_MODELS } from "@/lib/tenant/models";

/**
 * Phase 12 — cross-tenant isolation, run AS THE app_rls role against a real DB. GATED: only runs
 * when TENANT_ISOLATION_DB=1 (and DATABASE_URL_APP + DATABASE_URL_UNPOOLED are set), so the default
 * `vitest run` (pure, DB-free) stays green. In CI, set those to a test DB/branch to gate merges.
 *
 * TEETH: point DATABASE_URL_APP at the OWNER (BYPASSRLS) and these assertions fail — proof the
 * suite actually tests the boundary. Removing FORCE / the set_config likewise breaks it.
 *
 * H1/D17: in CI, DATABASE_URL_APP points at a TRANSACTION-mode PgBouncer (pool_mode=transaction,
 * default_pool_size=1, empty server_reset_query) in front of Postgres — i.e. the suite runs the way
 * prod does, through a pooler that reuses one physical connection across transactions without scrubbing
 * session state. That is the only configuration in which a session-scoped tenant GUC would leak; the
 * "pooler no-bleed" test below asserts it does not. Against direct Postgres the suite still passes — it
 * only grows the pooler teeth when DATABASE_URL_APP is a transaction pooler (Neon's pooled endpoint, or
 * the CI PgBouncer). See .github/workflows/ci.yml.
 */
const ENABLED = process.env.TENANT_ISOLATION_DB === "1" && !!process.env.DATABASE_URL_APP && !!process.env.DATABASE_URL_UNPOOLED;

const A = "org_bhutan_wine_co";
const B = "org_isolation_vitest_b";

describe.skipIf(!ENABLED)("cross-tenant isolation (as app_rls)", () => {
  // Constructed in beforeAll, NOT at describe-collection: Vitest still runs a skipped suite's body to
  // collect it, and `new PrismaClient({ url: undefined })` throws — so building clients here would fail
  // the whole run in any env without the DB vars set (e.g. the plain `vitest run` CI job). beforeAll
  // only runs when the suite is NOT skipped, i.e. exactly when ENABLED and the URLs are present.
  let owner: PrismaClient;
  let app: PrismaClient;

  const asTenant = <T>(t: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t}, true)`;
      return fn(tx);
    });

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED } } });
    app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
    // Tenant A already exists in a real DB; on a fresh DB (CI) it must be created so the FK-bound
    // fixtures below (tenantId = A) can insert. Idempotent — a no-op update against the real tenant.
    await owner.organization.upsert({ where: { id: A }, update: {}, create: { id: A, name: "Bhutan Wine Co", slug: A } });
    await owner.organization.upsert({ where: { id: B }, update: {}, create: { id: B, name: "Iso Vitest B", slug: B } });
    const now = new Date();
    await owner.lot.upsert({ where: { id: "isov_a" }, update: {}, create: { id: "isov_a", code: "ISOV-A", tenantId: A, updatedAt: now } });
    await owner.lot.upsert({ where: { id: "isov_b" }, update: {}, create: { id: "isov_b", code: "ISOV-B", tenantId: B, updatedAt: now } });
    // Raw-SQL isolation fixtures (plan 029): a vineyard+block+brix_log per tenant so the affected
    // getLatestBrixByBlock DISTINCT-ON raw read can be exercised under RLS.
    await owner.vineyard.upsert({ where: { id: "isov_vy_a" }, update: {}, create: { id: "isov_vy_a", name: "ISOV VY A", tenantId: A } });
    await owner.vineyard.upsert({ where: { id: "isov_vy_b" }, update: {}, create: { id: "isov_vy_b", name: "ISOV VY B", tenantId: B } });
    await owner.vineyardBlock.upsert({ where: { id: "isov_blk_a" }, update: {}, create: { id: "isov_blk_a", vineyardId: "isov_vy_a", tenantId: A, updatedAt: now } });
    await owner.vineyardBlock.upsert({ where: { id: "isov_blk_b" }, update: {}, create: { id: "isov_blk_b", vineyardId: "isov_vy_b", tenantId: B, updatedAt: now } });
    await owner.brixLog.upsert({ where: { id: "isov_brix_a" }, update: {}, create: { id: "isov_brix_a", blockId: "isov_blk_a", vineyardId: "isov_vy_a", brixValue: "22.5", createdByEmail: "iso@test", tenantId: A } });
    await owner.brixLog.upsert({ where: { id: "isov_brix_b" }, update: {}, create: { id: "isov_brix_b", blockId: "isov_blk_b", vineyardId: "isov_vy_b", brixValue: "23.5", createdByEmail: "iso@test", tenantId: B } });
    // Phase 14 compliance tables (checklist item 9).
    const period = { periodStart: now, periodEnd: now, onHandEnd: {}, computed: {}, overrides: {} };
    await owner.complianceReport.upsert({ where: { id: "isov_rep_a" }, update: {}, create: { id: "isov_rep_a", tenantId: A, updatedAt: now, ...period } });
    await owner.complianceReport.upsert({ where: { id: "isov_rep_b" }, update: {}, create: { id: "isov_rep_b", tenantId: B, updatedAt: now, ...period } });
    // Phase 9 Work Order tables (checklist item 9).
    await owner.workOrder.upsert({ where: { id: "isov_wo_a" }, update: {}, create: { id: "isov_wo_a", tenantId: A, number: 91001, title: "ISOV WO A", updatedAt: now } });
    await owner.workOrder.upsert({ where: { id: "isov_wo_b" }, update: {}, create: { id: "isov_wo_b", tenantId: B, number: 91002, title: "ISOV WO B", updatedAt: now } });
  });

  afterAll(async () => {
    await owner.workOrder.deleteMany({ where: { id: { in: ["isov_wo_a", "isov_wo_b", "isov_wo_x"] } } });
    await owner.complianceReport.deleteMany({ where: { id: { in: ["isov_rep_a", "isov_rep_b"] } } });
    await owner.brixLog.deleteMany({ where: { id: { in: ["isov_brix_a", "isov_brix_b"] } } });
    await owner.vineyardBlock.deleteMany({ where: { id: { in: ["isov_blk_a", "isov_blk_b"] } } });
    await owner.vineyard.deleteMany({ where: { id: { in: ["isov_vy_a", "isov_vy_b"] } } });
    await owner.lot.deleteMany({ where: { id: { in: ["isov_a", "isov_b"] } } });
    await owner.organization.deleteMany({ where: { id: B } });
    await app.$disconnect();
    await owner.$disconnect();
  });

  it("app connects as a NOBYPASSRLS non-superuser role", async () => {
    const [r] = await app.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(r.rolbypassrls).toBe(false);
    expect(r.rolsuper).toBe(false);
  });

  it("no context -> 0 rows (fail-closed)", async () => {
    expect(await app.lot.count()).toBe(0);
  });

  it("tenant A sees its own lot but not tenant B's", async () => {
    expect(await asTenant(A, (db) => db.lot.findFirst({ where: { id: "isov_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.lot.findFirst({ where: { id: "isov_b" } }))).toBeNull();
  });

  it("cross-tenant UPDATE/DELETE affect 0 rows", async () => {
    expect((await asTenant(A, (db) => db.lot.updateMany({ where: { id: "isov_b" }, data: { note: "x" } }))).count).toBe(0);
    expect((await asTenant(A, (db) => db.lot.deleteMany({ where: { id: "isov_b" } }))).count).toBe(0);
  });

  it("foreign-tenant INSERT raises (WITH CHECK)", async () => {
    await expect(
      asTenant(A, (db) => db.lot.create({ data: { id: "isov_x", code: "ISOV-X", tenantId: B, updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("compliance_report is tenant-isolated (Phase 14): A sees its own, not B's; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.complianceReport.findFirst({ where: { id: "isov_rep_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.complianceReport.findFirst({ where: { id: "isov_rep_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.complianceReport.create({ data: { id: "isov_rep_x", tenantId: B, periodStart: new Date(), periodEnd: new Date(), onHandEnd: {}, computed: {}, overrides: {}, updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  it("raw $queryRaw respects app.tenant_id (plan 029 — the raw path the extension does NOT intercept)", async () => {
    // As A, a raw select over both lots returns ONLY A's row (RLS scopes the raw read via the GUC).
    const aRows = await asTenant(A, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('isov_a', 'isov_b')`);
    expect(aRows.map((r) => r.id)).toEqual(["isov_a"]);
    // With NO context, a raw read sees nothing — this is the silent-empty the unwrapped $queryRaw caused in prod.
    const noCtx = await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('isov_a', 'isov_b')`;
    expect(noCtx).toHaveLength(0);
  });

  it("brix_log raw DISTINCT-ON read is tenant-isolated (plan 029 — getLatestBrixByBlock path)", async () => {
    // The getLatestBrixByBlock query shape, as A over A's vineyard: returns A's block only.
    const aRows = await asTenant(A, (tx) => tx.$queryRaw<{ blockId: string }[]>`
      SELECT DISTINCT ON ("blockId") "blockId" FROM "brix_log" WHERE "vineyardId" = 'isov_vy_a' ORDER BY "blockId", "recordedAt" DESC, "id" DESC`);
    expect(aRows.map((r) => r.blockId)).toEqual(["isov_blk_a"]);
    // As A, querying B's vineyard returns nothing (RLS invisibility on the raw read).
    const aSeesB = await asTenant(A, (tx) => tx.$queryRaw<{ blockId: string }[]>`SELECT "blockId" FROM "brix_log" WHERE "vineyardId" = 'isov_vy_b'`);
    expect(aSeesB).toHaveLength(0);
  });

  it("pooler no-bleed: SET LOCAL tenant context does not survive a committed tx on a reused connection (D17/H1)", async () => {
    // The catastrophic multi-tenant failure a direct-Postgres proof can't catch: a transaction-mode
    // pooler hands the SAME physical server connection to the next client without resetting session
    // state. Because tenant context is set with SET LOCAL (set_config(app.tenant_id, ..., true)), it is
    // scoped to the transaction and cleared on COMMIT — so a following no-context op on the reused
    // connection must be fail-closed. If this ever regressed to a session-scoped SET, tenant A's id
    // would persist on the pooled connection and the assertions below would see A's row.
    // (In CI this connection is PgBouncer with default_pool_size=1, guaranteeing the reuse.)
    expect(await asTenant(A, (db) => db.lot.findFirst({ where: { id: "isov_a" } }))).not.toBeNull(); // visible INSIDE the tx
    expect(await app.lot.count()).toBe(0); // ...gone immediately after commit, on the reused connection
    // The raw path (which the tenant extension does not wrap) is likewise fail-closed on that connection.
    expect(await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" = 'isov_a'`).toHaveLength(0);
  });

  it("composite-FK cross-tenant reference rejected (K11)", async () => {
    await expect(
      asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "isov_b", deltaL: 1, bucket: "EXTERNAL", lotCode: "X" } });
      }),
    ).rejects.toThrow();
  });

  it("work_order is tenant-isolated (Phase 9): A sees its own, not B's; foreign INSERT rejected", async () => {
    expect(await asTenant(A, (db) => db.workOrder.findFirst({ where: { id: "isov_wo_a" } }))).not.toBeNull();
    expect(await asTenant(A, (db) => db.workOrder.findFirst({ where: { id: "isov_wo_b" } }))).toBeNull();
    await expect(
      asTenant(A, (db) => db.workOrder.create({ data: { id: "isov_wo_x", tenantId: B, number: 91003, title: "ISOV WO X", updatedAt: new Date() } })),
    ).rejects.toThrow();
  });

  // Coverage guard (checklist steps 6 + 9): EVERY non-global model must have RLS enabled + FORCED
  // and a tenant_isolation policy. Enumerated from Prisma's datamodel so a table added without its
  // RLS migration fails here — covers the newer Phase-8/14/reminder tables and every future one,
  // without a per-table fixture that would itself go stale. Read-only (config assertion).
  it("every non-global table has RLS enabled + forced + a tenant_isolation policy (steps 6/9)", async () => {
    const expected = Prisma.dmmf.datamodel.models
      .filter((m) => !GLOBAL_MODELS.has(m.name))
      .map((m) => m.dbName ?? m.name);
    const rows = await owner.$queryRaw<{ relname: string; rls: boolean; forced: boolean; has_policy: boolean }[]>`
      SELECT c.relname,
             c.relrowsecurity AS rls,
             c.relforcerowsecurity AS forced,
             EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS has_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (${Prisma.join(expected)})`;
    const byName = new Map(rows.map((r) => [r.relname, r]));
    const missing = expected.filter((t) => {
      const r = byName.get(t);
      return !r || !r.rls || !r.forced || !r.has_policy;
    });
    expect(missing, `tables missing RLS/forced/policy: ${missing.join(", ") || "(none)"}`).toEqual([]);
  });
});
