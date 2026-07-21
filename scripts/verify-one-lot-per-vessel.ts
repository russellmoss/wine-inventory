/**
 * LEDGER-12 guard — a vessel holds AT MOST ONE lot (plan 088, Unit 2).
 *
 * A vessel's contents are one cohesive liquid. Two lots in one tank is a state the physical
 * world does not have; every "which lot?" picker in the app existed only to resolve it.
 * The inverse stays legal and unbounded: ONE lot may occupy MANY vessels (40 barrels is
 * normal), so this checks per-vessel and never per-lot.
 *
 * Read-only, cross-tenant, cheap enough for CI. Exits non-zero on any violation.
 * Deliberately reports CURRENT violations only — the historical "which op introduced this"
 * attribution is a separate, more expensive report (scripts/audit-co-residence.ts), because
 * mixing the two makes the CI gate slow and awkward to keep correct around corrections.
 *
 * Reads via runAsSystem: `vessel_lot` is RLS-protected, so a pooled app_rls client without a
 * tenant GUC returns ZERO rows and this would report a false clean.
 *
 * Run:  npm run verify:one-lot-per-vessel
 */
import { findCoResidence, type VesselLotBalance } from "@/lib/ledger/math";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

type OccupancyRow = {
  tenantId: string;
  vesselId: string;
  vesselCode: string;
  vesselType: string;
  lotId: string;
  lotCode: string;
  volumeL: string;
};

async function main() {
  const rows = await runAsSystem(async (db) =>
    db.$queryRawUnsafe<OccupancyRow[]>(`
      SELECT vl."tenantId"  AS "tenantId",
             vl."vesselId"  AS "vesselId",
             v.code         AS "vesselCode",
             v.type::text   AS "vesselType",
             vl."lotId"     AS "lotId",
             l.code         AS "lotCode",
             vl."volumeL"::text AS "volumeL"
      FROM vessel_lot vl
      JOIN vessel v ON v.id = vl."vesselId"
      JOIN lot    l ON l.id = vl."lotId"
      ORDER BY vl."tenantId", v.code, vl."volumeL" DESC
    `),
  );

  // Group per tenant, then reuse the SAME pure predicate the ledger chokepoint asserts with,
  // so the CI guard and the runtime guard can never drift apart.
  const byTenant = new Map<string, OccupancyRow[]>();
  for (const r of rows) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r]);

  const labelByVessel = new Map<string, string>();
  const rowByKey = new Map<string, OccupancyRow>();
  for (const r of rows) {
    labelByVessel.set(r.vesselId, `${r.vesselType === "BARREL" ? "Barrel" : "Tank"} ${r.vesselCode}`);
    rowByKey.set(`${r.vesselId}::${r.lotId}`, r);
  }

  let violationCount = 0;
  for (const [tenantId, tenantRows] of [...byTenant].sort(([a], [b]) => a.localeCompare(b))) {
    const balances: VesselLotBalance[] = tenantRows.map((r) => ({
      vesselId: r.vesselId,
      lotId: r.lotId,
      volumeL: Number(r.volumeL),
    }));
    const violations = findCoResidence(balances);
    if (violations.length === 0) continue;

    console.error(`\n${tenantId}`);
    for (const v of violations) {
      violationCount++;
      const detail = v.lotIds
        .map((lotId) => {
          const row = rowByKey.get(`${v.vesselId}::${lotId}`);
          return `${row?.lotCode ?? lotId} (${row?.volumeL ?? "?"} L)`;
        })
        .join(", ");
      console.error(`  ✗ ${labelByVessel.get(v.vesselId)} holds ${v.lotIds.length} lots — ${detail}`);
    }
  }

  const occupiedVessels = new Set(rows.map((r) => r.vesselId)).size;
  console.log(
    `\nLEDGER-12: checked ${occupiedVessels} occupied vessel(s) across ${byTenant.size} tenant(s).`,
  );

  if (violationCount > 0) {
    console.error(
      `\nFAIL — ${violationCount} vessel(s) hold more than one lot.\n` +
        `Run \`npx tsx --env-file=.env scripts/audit-co-residence.ts\` for the full evidence pack,\n` +
        `then \`scripts/repair-co-residence.ts\` to collapse them.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("PASS — every vessel holds at most one lot.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
  });
