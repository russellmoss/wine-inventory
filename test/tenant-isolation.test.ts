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
  });

  afterAll(async () => {
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

  it("composite-FK cross-tenant reference rejected (K11)", async () => {
    await expect(
      asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "isov_b", deltaL: 1, bucket: "EXTERNAL", lotCode: "X" } });
      }),
    ).rejects.toThrow();
  });
});
