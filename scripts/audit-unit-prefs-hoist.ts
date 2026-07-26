/**
 * Plan 098 Unit 6 — the READ-ONLY audit gate that must run BEFORE Migration B (council C1).
 *
 * Both per-vineyard unit columns are user-writable today (the WeatherCard toggle writes
 * VineyardWeatherConfig.unitSystem; the vineyard modal + assistant entity editor write
 * VineyardDetail.defaultUnit), so provenance can't be proven from the schema — a blanket
 * backfill-to-NULL would destroy real intent irreversibly. This script prints, per tenant,
 * the distinct values of BOTH columns so a human can confirm the hoist-if-uniform plan:
 *   - uniform value per tenant  → hoist to AppSettings.unitSystem (only where master is NULL),
 *                                 then NULL only the rows MATCHING the hoisted value;
 *   - non-uniform values        → rows are PRESERVED as explicit per-vineyard overrides.
 *
 * Read-only. Reads via runAsSystem because both tables are RLS-protected.
 *
 * Run:  npx tsx --env-file=.env scripts/audit-unit-prefs-hoist.ts
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

async function main() {
  await runAsSystem(async (db) => {
    const weather = await db.$queryRaw<
      { tenantId: string; unitSystem: string; n: bigint }[]
    >`SELECT "tenantId", "unitSystem", COUNT(*) AS n
      FROM "vineyard_weather_config"
      GROUP BY "tenantId", "unitSystem"
      ORDER BY "tenantId", "unitSystem"`;

    const detail = await db.$queryRaw<
      { tenantId: string; defaultUnit: string; n: bigint }[]
    >`SELECT "tenantId", "defaultUnit", COUNT(*) AS n
      FROM "vineyard_detail"
      GROUP BY "tenantId", "defaultUnit"
      ORDER BY "tenantId", "defaultUnit"`;

    const masters = await db.$queryRaw<
      { tenantId: string; unitSystem: string | null }[]
    >`SELECT "tenantId", "unitSystem" FROM "app_settings" ORDER BY "tenantId"`;

    console.log("=== AppSettings.unitSystem (tenant master; NULL = unset) ===");
    for (const m of masters) console.log(`  ${m.tenantId}: ${m.unitSystem ?? "NULL"}`);

    console.log("\n=== VineyardWeatherConfig.unitSystem by tenant ===");
    const byTenantW = new Map<string, string[]>();
    for (const r of weather) {
      console.log(`  ${r.tenantId}: ${r.unitSystem} × ${r.n}`);
      byTenantW.set(r.tenantId, [...(byTenantW.get(r.tenantId) ?? []), r.unitSystem]);
    }

    console.log("\n=== VineyardDetail.defaultUnit by tenant ===");
    const byTenantD = new Map<string, string[]>();
    for (const r of detail) {
      console.log(`  ${r.tenantId}: ${r.defaultUnit} × ${r.n}`);
      byTenantD.set(r.tenantId, [...(byTenantD.get(r.tenantId) ?? []), r.defaultUnit]);
    }

    console.log("\n=== Hoist verdicts ===");
    const tenants = new Set([...byTenantW.keys(), ...byTenantD.keys()]);
    for (const t of tenants) {
      const w = byTenantW.get(t) ?? [];
      const d = byTenantD.get(t) ?? [];
      const wVerdict = w.length === 0 ? "no rows" : w.length === 1 ? `UNIFORM ${w[0]}` : `MIXED (${w.join(", ")}) — preserve as overrides`;
      const dVerdict = d.length === 0 ? "no rows" : d.length === 1 ? `UNIFORM ${d[0]}` : `MIXED (${d.join(", ")}) — preserve as overrides`;
      console.log(`  ${t}: weather ${wVerdict}; geometry ${dVerdict}`);
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectSystem());
