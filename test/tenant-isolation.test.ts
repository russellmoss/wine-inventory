import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Phase 12 — cross-tenant isolation, run AS THE app_rls role against a real DB. GATED: only runs
 * when TENANT_ISOLATION_DB=1 (and DATABASE_URL_APP + DATABASE_URL_UNPOOLED are set), so the default
 * `vitest run` (pure, DB-free) stays green. In CI, set those to a test DB/branch to gate merges.
 *
 * TEETH: point DATABASE_URL_APP at the OWNER (BYPASSRLS) and these assertions fail — proof the
 * suite actually tests the boundary. Removing FORCE / the set_config likewise breaks it.
 */
const ENABLED = process.env.TENANT_ISOLATION_DB === "1" && !!process.env.DATABASE_URL_APP && !!process.env.DATABASE_URL_UNPOOLED;

const A = "org_bhutan_wine_co";
const B = "org_isolation_vitest_b";

describe.skipIf(!ENABLED)("cross-tenant isolation (as app_rls)", () => {
  const owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED } } });
  const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });

  const asTenant = <T>(t: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t}, true)`;
      return fn(tx);
    });

  beforeAll(async () => {
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
  });

  afterAll(async () => {
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

  it("composite-FK cross-tenant reference rejected (K11)", async () => {
    await expect(
      asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "isov_b", deltaL: 1, bucket: "EXTERNAL", lotCode: "X" } });
      }),
    ).rejects.toThrow();
  });
});
