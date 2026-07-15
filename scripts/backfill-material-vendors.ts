import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { findOrCreateVendorCore, ensureUnknownVendor } from "@/lib/vendors/vendors";
import { prisma } from "@/lib/prisma";

// Plan 069 Unit 4: backfill the managed-vendor link. For each tenant:
//   1. seed the per-tenant "Unknown / Unspecified" fallback vendor (idempotent);
//   2. every CellarMaterial with vendorId == null gets one: its legacy free-text `vendor` is find-or-created
//      (dedup by tenant+name; url carried from vendorUrl), else it maps to the Unknown fallback;
//   3. every SupplyLot with vendorId == null inherits its material's resolved vendorId.
// Idempotent + re-runnable (only touches rows still at NULL). Runs per-tenant under runAsTenant so RLS +
// the tenant extension apply and tenantId auto-injects. Scope to ONE tenant with TENANT_ID=org_... (else all).
//   npx tsx --env-file=.env scripts/backfill-material-vendors.ts

const ONLY = process.env.TENANT_ID?.trim() || null;

async function backfillTenant(tenantId: string) {
  return runAsTenant(tenantId, async () => {
    const unknown = await ensureUnknownVendor();

    const mats = await prisma.cellarMaterial.findMany({
      where: { vendorId: null },
      select: { id: true, vendor: true, vendorUrl: true },
    });
    let mapped = 0;
    let toUnknown = 0;
    for (const m of mats) {
      const name = m.vendor?.trim();
      let vendorId = unknown.id;
      if (name) {
        const v = await findOrCreateVendorCore({ name, url: m.vendorUrl });
        vendorId = v?.id ?? unknown.id;
        mapped++;
      } else {
        toUnknown++;
      }
      await prisma.cellarMaterial.update({ where: { id: m.id }, data: { vendorId } });
    }

    // Lots inherit their material's vendor. Build the map once (avoid N+1 lookups).
    const allMats = await prisma.cellarMaterial.findMany({ select: { id: true, vendorId: true } });
    const vByMat = new Map(allMats.map((m) => [m.id, m.vendorId] as const));
    const lots = await prisma.supplyLot.findMany({ where: { vendorId: null }, select: { id: true, materialId: true } });
    let lotsSet = 0;
    for (const l of lots) {
      const vid = vByMat.get(l.materialId);
      if (vid) {
        await prisma.supplyLot.update({ where: { id: l.id }, data: { vendorId: vid } });
        lotsSet++;
      }
    }

    const remainingMat = await prisma.cellarMaterial.count({ where: { vendorId: null } });
    const remainingLot = await prisma.supplyLot.count({ where: { vendorId: null } });
    return { tenantId, materials: mats.length, mapped, toUnknown, lotsSet, remainingMat, remainingLot };
  });
}

(async () => {
  const tenantIds = ONLY
    ? [ONLY]
    : (await runAsSystem((db) => db.organization.findMany({ select: { id: true } }))).map((o) => o.id);
  console.log(`Backfilling vendor links for ${tenantIds.length} tenant(s)${ONLY ? ` (scoped: ${ONLY})` : ""}...`);
  for (const t of tenantIds) {
    const r = await backfillTenant(t);
    console.log(JSON.stringify(r));
    if (r.remainingMat > 0 || r.remainingLot > 0) {
      console.error(`  ⚠ ${t}: ${r.remainingMat} materials / ${r.remainingLot} lots still NULL after backfill`);
    }
  }
  await prisma.$disconnect();
  console.log("Backfill complete.");
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
