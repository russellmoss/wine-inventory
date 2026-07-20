import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";

// Plan 080 U1: backfill SupplyLot.locationId (the expand-phase column added by the
// 20260719120000_supplylot_location_material_movement migration). For each tenant:
//   1. ENSURE the system "Winery" Location exists (find-or-create; council flagged: do NOT assume it does —
//      a tenant seeded before the system-location convention may lack one);
//   2. set every SupplyLot with locationId == null to that system location.
// After this leaves 0 nulls across all tenants, a follow-up migration (Unit 13a) runs
// `ALTER TABLE supply_lot ALTER COLUMN "locationId" SET NOT NULL` (council S7 deploy-safe ordering).
// Idempotent + re-runnable (only touches rows still at NULL). Per-tenant under runAsTenant so RLS + the
// tenant extension apply and tenantId auto-injects. Scope to ONE tenant with TENANT_ID=org_... (else all).
//   npx tsx --env-file=.env scripts/backfill-supplylot-location.ts

const ONLY = process.env.TENANT_ID?.trim() || null;

async function ensureSystemLocation(): Promise<string> {
  // Prefer the flagged system location; else reuse an existing "Winery" (some tenants have one that predates
  // the isSystem convention — creating would collide on the (tenantId,name) unique); else create it.
  const bySystem = await prisma.location.findFirst({ where: { isSystem: true }, select: { id: true } });
  if (bySystem) return bySystem.id;
  const byName = await prisma.location.findFirst({ where: { name: "Winery" }, select: { id: true } });
  if (byName) return byName.id;
  const created = await prisma.location.create({
    data: { name: "Winery", isSystem: true, isActive: true },
    select: { id: true },
  });
  return created.id;
}

async function backfillTenant(tenantId: string) {
  return runAsTenant(tenantId, async () => {
    const systemLocationId = await ensureSystemLocation();
    // Plan 080 U13a: locationId is now NOT NULL, so the typed client can no longer even EXPRESS
    // `where: { locationId: null }`. Raw SQL keeps this script working if the constraint is ever dropped
    // for a re-expand (the documented rollback), instead of deleting the deploy path outright. Raw is
    // tenant-scoped by the surrounding runAsTenant + RLS; the explicit tenantId predicate is belt-and-braces.
    const filled = await prisma.$executeRaw`
      UPDATE "supply_lot" SET "locationId" = ${systemLocationId}
      WHERE "locationId" IS NULL AND "tenantId" = ${tenantId}`;
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint n FROM "supply_lot" WHERE "locationId" IS NULL AND "tenantId" = ${tenantId}`;
    return { tenantId, systemLocationId, filled, remaining: Number(rows[0]?.n ?? 0) };
  });
}

(async () => {
  const tenantIds = ONLY
    ? [ONLY]
    : (await runAsSystem((db) => db.organization.findMany({ select: { id: true } }))).map((o) => o.id);
  console.log(`Backfilling supply_lot.locationId for ${tenantIds.length} tenant(s)${ONLY ? ` (scoped: ${ONLY})` : ""}...`);
  let anyRemaining = false;
  for (const t of tenantIds) {
    const r = await backfillTenant(t);
    console.log(JSON.stringify(r));
    if (r.remaining > 0) {
      anyRemaining = true;
      console.error(`  ⚠ ${t}: ${r.remaining} supply lots still NULL after backfill`);
    }
  }
  await prisma.$disconnect();
  console.log(anyRemaining ? "Backfill finished WITH remaining nulls — do NOT run SET NOT NULL yet." : "Backfill complete — 0 nulls, safe to SET NOT NULL.");
  if (anyRemaining) process.exit(1);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
