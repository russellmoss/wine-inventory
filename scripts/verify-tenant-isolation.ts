/**
 * Phase 12 EXIT PROOF — cross-tenant isolation, exercised AS THE non-owner app_rls role.
 *
 *   npx tsx --env-file=.env scripts/verify-tenant-isolation.ts
 *
 * Two clients:
 *   owner  = DATABASE_URL_UNPOOLED (BYPASSRLS) — sets up + tears down cross-tenant fixtures.
 *   app    = DATABASE_URL_APP      (app_rls, NOBYPASSRLS) — the client under test; RLS applies.
 *
 * Tenant A = Bhutan (existing). Tenant B = a throwaway org created for the run and deleted after.
 * Every assertion is what a real request would do; a leak makes the script exit non-zero.
 *
 * TEETH: this only has teeth because `app` connects as app_rls. Point DATABASE_URL_APP at the
 * OWNER (BYPASSRLS) instead and the cross-tenant reads would return rows -> the script FAILS,
 * proving it actually tests the boundary (see the role-attribute check below).
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const A = "org_bhutan_wine_co";
const B = "org_isolation_test_b";

const OWNER_URL = process.env.DATABASE_URL_UNPOOLED;
const APP_URL = process.env.DATABASE_URL_APP;
if (!OWNER_URL) throw new Error("DATABASE_URL_UNPOOLED (owner) required.");
if (!APP_URL) throw new Error("DATABASE_URL_APP (app_rls) required — run scripts/setup-app-rls-credential.ts first.");

const owner = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
const app = new PrismaClient({ datasources: { db: { url: APP_URL } } });

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}

/** Run fn as app_rls with the tenant GUC set for the transaction (mirrors the app extension). The
 * interactive-tx timeout is lifted well above Prisma's 5s default (env-overridable) so a high-latency
 * link — airplane wifi, or a Neon cold-start with ~1s round-trips — doesn't expire the positive-control
 * tx mid-run (P2028). */
const VERIFY_TX_TIMEOUT_MS = Number(process.env.VERIFY_TX_TIMEOUT_MS) || 120_000;
function asTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return app.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: VERIFY_TX_TIMEOUT_MS, maxWait: VERIFY_TX_TIMEOUT_MS },
  );
}

async function main() {
  // Sanity: the app client MUST be a non-owner, NOBYPASSRLS role (or the whole proof is a no-op).
  const attrs = await app.$queryRaw<{ current_user: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
    SELECT current_user, r.rolbypassrls, r.rolsuper FROM pg_roles r WHERE r.rolname = current_user`;
  check("app connects as a NOBYPASSRLS, non-superuser role", !!attrs[0] && !attrs[0].rolbypassrls && !attrs[0].rolsuper, `current_user=${attrs[0]?.current_user}`);

  // ── Setup (owner, bypasses RLS): tenant B + one lot per tenant. ──
  // Tenant A exists in a real DB; on a fresh DB (CI) create it so the FK-bound fixtures can insert.
  // Idempotent — a no-op update against the real tenant.
  await owner.organization.upsert({ where: { id: A }, update: {}, create: { id: A, name: "Bhutan Wine Co", slug: A } });
  await owner.organization.upsert({ where: { id: B }, update: {}, create: { id: B, name: "Isolation Test B", slug: B } });
  const now = new Date();
  await owner.lot.upsert({ where: { id: "iso_lot_a" }, update: {}, create: { id: "iso_lot_a", code: "ISO-A", tenantId: A, updatedAt: now } });
  await owner.lot.upsert({ where: { id: "iso_lot_b" }, update: {}, create: { id: "iso_lot_b", code: "ISO-B", tenantId: B, updatedAt: now } });
  // Plan 029 raw-SQL fixtures: a vineyard+block+brix_log per tenant for the getLatestBrixByBlock path.
  await owner.vineyard.upsert({ where: { id: "iso_vy_a" }, update: {}, create: { id: "iso_vy_a", name: "ISO VY A", tenantId: A } });
  await owner.vineyard.upsert({ where: { id: "iso_vy_b" }, update: {}, create: { id: "iso_vy_b", name: "ISO VY B", tenantId: B } });
  await owner.vineyardBlock.upsert({ where: { id: "iso_blk_a" }, update: {}, create: { id: "iso_blk_a", vineyardId: "iso_vy_a", tenantId: A, updatedAt: now } });
  await owner.vineyardBlock.upsert({ where: { id: "iso_blk_b" }, update: {}, create: { id: "iso_blk_b", vineyardId: "iso_vy_b", tenantId: B, updatedAt: now } });
  await owner.brixLog.upsert({ where: { id: "iso_brix_a" }, update: {}, create: { id: "iso_brix_a", blockId: "iso_blk_a", vineyardId: "iso_vy_a", brixValue: "22.5", createdByEmail: "iso@test", tenantId: A } });
  await owner.brixLog.upsert({ where: { id: "iso_brix_b" }, update: {}, create: { id: "iso_brix_b", blockId: "iso_blk_b", vineyardId: "iso_vy_b", brixValue: "23.5", createdByEmail: "iso@test", tenantId: B } });

  try {
    // 1. Fail-closed: no tenant context -> 0 rows.
    const noCtx = await app.lot.count();
    check("no context -> 0 rows (fail-closed)", noCtx === 0, `saw ${noCtx}`);

    // 2. As tenant A: sees A's lot, NOT B's (RLS invisibility on SELECT).
    const aSeesOwn = await asTenant(A, (db) => db.lot.findFirst({ where: { id: "iso_lot_a" } }));
    check("tenant A sees its own lot", !!aSeesOwn);
    const aSeesB = await asTenant(A, (db) => db.lot.findFirst({ where: { id: "iso_lot_b" } }));
    check("tenant A CANNOT see tenant B's lot (SELECT)", aSeesB === null);

    // 3. Cross-tenant UPDATE / DELETE affect 0 rows (row invisible).
    const upd = await asTenant(A, (db) => db.lot.updateMany({ where: { id: "iso_lot_b" }, data: { note: "hacked" } }));
    check("tenant A cross-tenant UPDATE affects 0 rows", upd.count === 0, `count=${upd.count}`);
    const del = await asTenant(A, (db) => db.lot.deleteMany({ where: { id: "iso_lot_b" } }));
    check("tenant A cross-tenant DELETE affects 0 rows", del.count === 0, `count=${del.count}`);

    // 4. WITH CHECK: inserting a foreign tenantId while in tenant A raises.
    let insertRaised = false;
    try {
      await asTenant(A, (db) => db.lot.create({ data: { id: "iso_lot_x", code: "ISO-X", tenantId: B, updatedAt: new Date() } }));
    } catch { insertRaised = true; }
    check("foreign-tenant INSERT raises (WITH CHECK)", insertRaised);

    // 5. Composite-FK cross-tenant reference rejected (K11): op in A referencing B's lot.
    let fkRaised = false;
    try {
      await asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "iso_lot_b", deltaL: 1, bucket: "EXTERNAL", lotCode: "X" } });
      });
    } catch { fkRaised = true; }
    check("composite-FK cross-tenant reference rejected (K11)", fkRaised);

    // 5b. Phase 8: supply_lot isolation. Owner seeds a material + costed receipt in B; app-as-A must
    // not see B's stock, and a foreign-tenant supply_lot insert while in A is rejected (WITH CHECK).
    await owner.cellarMaterial.upsert({
      where: { id: "iso_mat_b" },
      update: {},
      create: { id: "iso_mat_b", tenantId: B, name: "ISO KMBS", normalizedKey: "ISOKMBS", kind: "SO2", isStockTracked: true },
    });
    await owner.supplyLot.upsert({
      where: { id: "iso_supply_b" },
      update: {},
      create: { id: "iso_supply_b", tenantId: B, materialId: "iso_mat_b", qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.05", updatedAt: now },
    });
    const aSeesSupplyB = await asTenant(A, (db) => db.supplyLot.findFirst({ where: { id: "iso_supply_b" } }));
    check("tenant A CANNOT see tenant B's supply_lot (RLS)", aSeesSupplyB === null);
    let supplyInsertRaised = false;
    try {
      await asTenant(A, (db) => db.supplyLot.create({ data: { id: "iso_supply_x", tenantId: B, materialId: "iso_mat_b", qtyReceived: 1, qtyRemaining: 1, stockUnit: "g", updatedAt: new Date() } }));
    } catch { supplyInsertRaised = true; }
    check("foreign-tenant supply_lot INSERT raises (WITH CHECK)", supplyInsertRaised);

    // 5c. Plan 029: RAW $queryRaw respects the tenant GUC. The tenant extension only intercepts model
    // ops, so an unwrapped raw read runs with no app.tenant_id and (under RLS) returns 0 rows. These
    // prove the runInTenantRawTx path scopes raw reads and that a context-less raw read is fail-closed.
    const rawA = await asTenant(A, (db) => db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('iso_lot_a', 'iso_lot_b')`);
    check("raw $queryRaw as A returns only A's lot", rawA.length === 1 && rawA[0]?.id === "iso_lot_a", `saw ${rawA.map((r) => r.id).join(",")}`);
    const rawNoCtx = await app.$queryRaw<{ id: string }[]>`SELECT "id" FROM "lot" WHERE "id" IN ('iso_lot_a', 'iso_lot_b')`;
    check("raw $queryRaw with no context -> 0 rows (fail-closed)", rawNoCtx.length === 0, `saw ${rawNoCtx.length}`);
    const brixA = await asTenant(A, (db) => db.$queryRaw<{ blockId: string }[]>`SELECT DISTINCT ON ("blockId") "blockId" FROM "brix_log" WHERE "vineyardId" = 'iso_vy_a' ORDER BY "blockId", "recordedAt" DESC, "id" DESC`);
    check("brix_log raw DISTINCT-ON as A returns A's block", brixA.length === 1 && brixA[0]?.blockId === "iso_blk_a");
    const brixASeesB = await asTenant(A, (db) => db.$queryRaw<{ blockId: string }[]>`SELECT "blockId" FROM "brix_log" WHERE "vineyardId" = 'iso_vy_b'`);
    check("brix_log raw read as A CANNOT see B's vineyard rows", brixASeesB.length === 0, `saw ${brixASeesB.length}`);

    // 6. Positive control: same-tenant op line on A's own lot succeeds.
    let sameTenantOk = false;
    try {
      await asTenant(A, async (db) => {
        const op = await db.lotOperation.create({ data: { type: "SEED", enteredBy: "iso@test", tenantId: A }, select: { id: true } });
        await db.lotOperationLine.create({ data: { tenantId: A, operationId: op.id, lotId: "iso_lot_a", deltaL: 1, bucket: "EXTERNAL", lotCode: "ISO-A" } });
        // cleanup this op within the same tenant
        await db.lotOperationLine.deleteMany({ where: { operationId: op.id } });
        await db.lotOperation.deleteMany({ where: { id: op.id } });
      });
      sameTenantOk = true;
    } catch (e) { sameTenantOk = false; console.error(e); }
    check("same-tenant op line succeeds (positive control)", sameTenantOk);
  } finally {
    // ── Teardown (owner). ──
    await owner.lotOperationLine.deleteMany({ where: { lotId: { in: ["iso_lot_a", "iso_lot_b"] } } });
    await owner.lotOperation.deleteMany({ where: { tenantId: B } });
    await owner.supplyLot.deleteMany({ where: { id: { in: ["iso_supply_b", "iso_supply_x"] } } });
    await owner.cellarMaterial.deleteMany({ where: { id: "iso_mat_b" } });
    await owner.brixLog.deleteMany({ where: { id: { in: ["iso_brix_a", "iso_brix_b"] } } });
    await owner.vineyardBlock.deleteMany({ where: { id: { in: ["iso_blk_a", "iso_blk_b"] } } });
    await owner.vineyard.deleteMany({ where: { id: { in: ["iso_vy_a", "iso_vy_b"] } } });
    await owner.lot.deleteMany({ where: { id: { in: ["iso_lot_a", "iso_lot_b", "iso_lot_x"] } } });
    await owner.organization.deleteMany({ where: { id: B } });
    await app.$disconnect();
    await owner.$disconnect();
  }

  console.log(failures === 0 ? "\nALL ISOLATION CHECKS PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
