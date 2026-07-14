/**
 * Plan 066 — READ-ONLY advisory. Estimates how much KMBS stock was UNDER-booked by historical
 * ppm/mg/L SO₂ additions that pre-date the active-fraction fix (they depleted/costed grams of SO₂
 * instead of grams of KMBS). Writes NOTHING — ledger history is append-only (correction-as-event).
 * An operator reads this to decide whether to post a correcting adjustment; we never silently backfill.
 *
 * Run (from a checkout with .env): npx tsx scripts/so2-underbooking-report.ts
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { KMBS_SO2_FRACTION } from "@/lib/winemaking-calc/so2";

async function main() {
  const rows = await runAsSystem((db) =>
    db.lotTreatment.findMany({
      where: { rateBasis: "MG_L", material: { kind: "SO2" } },
      select: { tenantId: true, computedTotal: true, computedUnit: true, material: { select: { name: true, percentActive: true } } },
    }),
  );

  type Agg = { count: number; so2Grams: number; kmbsGrams: number };
  const byTenant = new Map<string, Agg>();
  for (const r of rows) {
    if (r.computedUnit !== "g" || r.computedTotal == null) continue; // only mass SO₂ doses
    const so2 = Number(r.computedTotal);
    const pct = r.material?.percentActive != null ? Number(r.material.percentActive) : null;
    const frac = pct != null && pct > 0 && pct <= 100 ? pct / 100 : KMBS_SO2_FRACTION;
    const kmbs = so2 / frac;
    const a = byTenant.get(r.tenantId) ?? { count: 0, so2Grams: 0, kmbsGrams: 0 };
    a.count += 1; a.so2Grams += so2; a.kmbsGrams += kmbs;
    byTenant.set(r.tenantId, a);
  }

  console.log("── SO₂/KMBS historical under-booking advisory (READ-ONLY, nothing written) ──");
  if (byTenant.size === 0) { console.log("  No historical ppm-based SO₂ additions found. Nothing to report."); return; }
  let tSo2 = 0, tKmbs = 0, tCount = 0;
  for (const [tenantId, a] of byTenant) {
    const under = a.kmbsGrams - a.so2Grams;
    tSo2 += a.so2Grams; tKmbs += a.kmbsGrams; tCount += a.count;
    console.log(`  ${tenantId}: ${a.count} additions | SO₂ booked ${a.so2Grams.toFixed(1)} g | true KMBS ${a.kmbsGrams.toFixed(1)} g | under-booked ≈ ${under.toFixed(1)} g KMBS`);
  }
  console.log(`  ── TOTAL: ${tCount} additions across ${byTenant.size} tenant(s); ~${(tKmbs - tSo2).toFixed(1)} g KMBS under-booked (booked ${tSo2.toFixed(1)} g SO₂ vs ${tKmbs.toFixed(1)} g KMBS at the active fraction).`);
  console.log("  These historical rows are NOT rewritten (append-only). Post a correcting adjustment if the drift matters.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await disconnectSystem?.(); process.exit(process.exitCode ?? 0); });
