import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { pushVendorToQboCore } from "@/lib/vendors/vendor-qbo-sync";

// Plan 077 Unit 7: one-time backfill of the eager QBO push. For each opted-in tenant with a CONNECTED QBO
// connection, push every existing Vendor that has no externalVendorId yet (they were created before eager push
// or while QBO was offline) so they exist in QuickBooks and get their id stamped. Idempotent + re-runnable:
// pushVendorToQboCore is query-before-create and skips already-linked vendors; a per-vendor failure stays pending
// (the retry sweep / lazy bill-post path catch it later). Runs per-tenant under runAsTenant so RLS + the tenant
// extension apply. Bhutan-not-backfilled precedent (Plan 069) — run explicitly, per tenant, on purpose.
//   npx tsx --env-file=.env scripts/backfill-vendor-qbo-sync.ts                 # every opted-in tenant
//   TENANT_ID=org_demo_winery npx tsx --env-file=.env scripts/backfill-vendor-qbo-sync.ts   # one tenant

const ONLY = process.env.TENANT_ID?.trim() || null;

async function backfillTenant(tenantId: string) {
  return runAsTenant(tenantId, async () => {
    const settings = await prisma.appSettings.findFirst({ select: { pushVendorsToQbo: true } });
    if (!settings?.pushVendorsToQbo) return { tenantId, opted: false as const };
    const conn = await prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
    if (!conn) return { tenantId, opted: true as const, connected: false as const };

    // Skip the Unknown/Unspecified fallback and any archived vendor with no QBO analog is fine — pushVendorToQboCore
    // resolves by DisplayName, so an inactive vendor still maps cleanly. Only unlinked rows are touched.
    const vendors = await prisma.vendor.findMany({ where: { externalVendorId: null }, select: { id: true } });
    let synced = 0, pending = 0, conflict = 0;
    for (const v of vendors) {
      const status = await pushVendorToQboCore(v.id); // already inside runAsTenant
      if (status === "synced") synced++;
      else if (status === "conflict") conflict++;
      else pending++;
    }
    return { tenantId, opted: true as const, connected: true as const, candidates: vendors.length, synced, pending, conflict };
  });
}

(async () => {
  const tenantIds = ONLY
    ? [ONLY]
    : (await runAsSystem((db) => db.organization.findMany({ select: { id: true } }))).map((o) => o.id);
  console.log(`Backfilling eager QBO push for ${tenantIds.length} tenant(s)${ONLY ? ` (scoped: ${ONLY})` : ""}...`);
  for (const t of tenantIds) {
    const r = await backfillTenant(t);
    console.log(JSON.stringify(r));
  }
  await prisma.$disconnect();
  console.log("Backfill complete.");
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
