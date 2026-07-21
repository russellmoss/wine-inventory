/**
 * Rebuild `vessel_component` from current state (plan 088, Unit 12b).
 *
 * `vessel_component` is a DERIVED projection — "what is actually in this tank" — but the ledger
 * folds it INCREMENTALLY, one delta per operation. That makes it self-healing for volume and
 * self-corrupting for attribution: once an operation books a delta against the wrong variety, no
 * later operation can take it back. The composition fold mis-attributed blended wine for a long
 * time (it credited absorbed wine to the resident's own origin, and skipped origin-less blend
 * lots entirely), so every vessel that has ever taken a blend can be skewed.
 *
 * This recomputes it directly instead of replaying history: a vessel's composition is just its
 * resident lot's volume spread over that lot's ANCESTOR LEAVES (composeLeaves), each leaf
 * contributing its own variety/vineyard/vintage. Pure function of vessel_lot + lot_lineage +
 * lot origins, so it is idempotent and needs no operation ordering.
 *
 * A leaf with no origin tuple is genuinely unattributable; its share is reported as UNKNOWN
 * rather than quietly rounded into someone else's variety.
 *
 * Read-only by default.
 *   npm run rebuild:vessel-composition
 *   npm run rebuild:vessel-composition -- --apply --tenant=org_demo_winery
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { composeLeaves, type LineageEdge } from "@/lib/lot/lineage";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const TENANT = argv.find((a) => a.startsWith("--tenant="))?.split("=")[1] ?? null;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Held = { tenantId: string; vesselId: string; vesselCode: string; lotId: string; volumeL: string };
type Origin = { id: string; varietyId: string | null; vineyardId: string | null; vintage: number | null };
type Existing = { id: string; tenantId: string; vesselId: string; varietyId: string; vineyardId: string; vintage: number; volumeL: string };

async function main() {
  await runAsSystem(async (db) => {
    const where = TENANT ? `WHERE vl."tenantId" = '${TENANT}'` : "";
    const held = await db.$queryRawUnsafe<Held[]>(`
      SELECT vl."tenantId" AS "tenantId", vl."vesselId" AS "vesselId", v.code AS "vesselCode",
             vl."lotId" AS "lotId", vl."volumeL"::text AS "volumeL"
      FROM vessel_lot vl JOIN vessel v ON v.id = vl."vesselId" ${where}
      ORDER BY vl."tenantId", v.code
    `);
    if (held.length === 0) return console.log("No occupied vessels in scope.");

    const edges = (
      await db.$queryRawUnsafe<{ parentLotId: string; childLotId: string; fraction: string | null; kind: string }[]>(
        `SELECT "parentLotId", "childLotId", fraction::text AS fraction, kind FROM lot_lineage`,
      )
    ).map<LineageEdge>((e) => ({
      parentLotId: e.parentLotId,
      childLotId: e.childLotId,
      fraction: e.fraction == null ? null : Number(e.fraction),
      kind: e.kind,
    }));

    const origins = new Map(
      (
        await db.$queryRawUnsafe<Origin[]>(
          `SELECT id, "originVarietyId" AS "varietyId", "originVineyardId" AS "vineyardId", "vintageYear" AS vintage FROM lot`,
        )
      ).map((o) => [o.id, o]),
    );

    const existing = await db.$queryRawUnsafe<Existing[]>(
      `SELECT id, "tenantId", "vesselId", "varietyId", "vineyardId", vintage, "volumeL"::text AS "volumeL" FROM vessel_component`,
    );
    const existingByKey = new Map(existing.map((e) => [`${e.vesselId}::${e.varietyId}::${e.vineyardId}::${e.vintage}`, e]));

    // Desired state, computed straight from current occupancy + lineage.
    const desired = new Map<string, { tenantId: string; vesselId: string; varietyId: string; vineyardId: string; vintage: number; volumeL: number }>();
    const unknownByVessel = new Map<string, number>();
    for (const h of held) {
      const volume = Number(h.volumeL);
      const { leaves } = composeLeaves(h.lotId, edges);
      for (const leaf of leaves) {
        const o = origins.get(leaf.lotId);
        const share = r2(volume * leaf.weight);
        if (!o?.varietyId || !o.vineyardId || o.vintage == null) {
          unknownByVessel.set(h.vesselId, r2((unknownByVessel.get(h.vesselId) ?? 0) + share));
          continue;
        }
        const key = `${h.vesselId}::${o.varietyId}::${o.vineyardId}::${o.vintage}`;
        const cur = desired.get(key);
        if (cur) cur.volumeL = r2(cur.volumeL + share);
        else desired.set(key, { tenantId: h.tenantId, vesselId: h.vesselId, varietyId: o.varietyId, vineyardId: o.vineyardId, vintage: o.vintage, volumeL: share });
      }
    }

    const scopedExisting = existing.filter((e) => !TENANT || e.tenantId === TENANT);
    const toDelete = scopedExisting.filter((e) => !desired.has(`${e.vesselId}::${e.varietyId}::${e.vineyardId}::${e.vintage}`));
    const toCreate = [...desired.entries()].filter(([k]) => !existingByKey.has(k)).map(([, v]) => v);
    // Tolerance, not equality. The INCREMENTAL fold is the precise one — it adds real line
    // volumes. This recomputation multiplies a lineage fraction stored as Decimal(6,5), so it
    // carries ~1e-5 relative error: on a 5,572 L tank that is 0.06 L per edge. Rewriting the exact
    // folded number with the approximation would be a downgrade, and would make every run report
    // drift forever. Real drift (the kind this script exists to repair) has been 100+ L.
    const tolerance = (volumeL: number) => Math.max(0.05, Math.abs(volumeL) * 1e-4);
    const toUpdate = [...desired.entries()]
      .map(([k, v]) => ({ v, e: existingByKey.get(k) }))
      .filter((x): x is { v: typeof x.v; e: Existing } => !!x.e && Math.abs(Number(x.e.volumeL) - x.v.volumeL) > tolerance(x.v.volumeL));

    const drifted = new Set([...toDelete.map((d) => d.vesselId), ...toCreate.map((c) => c.vesselId), ...toUpdate.map((u) => u.v.vesselId)]);
    const codeByVessel = new Map(held.map((h) => [h.vesselId, `${h.tenantId} ${h.vesselCode}`]));

    console.log(`\n${"═".repeat(70)}`);
    console.log(`REBUILD vessel_component — ${APPLY ? "APPLY" : "DRY RUN"}${TENANT ? ` · ${TENANT}` : " · all tenants"}`);
    console.log("═".repeat(70));
    console.log(`vessels in scope : ${new Set(held.map((h) => h.vesselId)).size}`);
    console.log(`rows to create   : ${toCreate.length}`);
    console.log(`rows to update   : ${toUpdate.length}`);
    console.log(`rows to delete   : ${toDelete.length}`);
    console.log(`vessels DRIFTED  : ${drifted.size}`);
    if (unknownByVessel.size > 0) {
      console.log(`\nunattributable (no origin on an ancestor) — reported, never folded into another variety:`);
      for (const [vesselId, v] of unknownByVessel) console.log(`  ${codeByVessel.get(vesselId) ?? vesselId}: ${v} L`);
    }
    if (drifted.size > 0) {
      console.log(`\ndrifted vessels:`);
      for (const vesselId of drifted) console.log(`  ${codeByVessel.get(vesselId) ?? vesselId}`);
    }

    if (!APPLY) {
      console.log(`\nDry run — nothing written. Re-run with --apply${TENANT ? ` --tenant=${TENANT}` : ""}.`);
      return;
    }
    if (toDelete.length > 0) {
      await db.$executeRawUnsafe(`DELETE FROM vessel_component WHERE id IN (${toDelete.map((d) => `'${d.id}'`).join(",")})`);
    }
    for (const u of toUpdate) {
      await db.$executeRawUnsafe(`UPDATE vessel_component SET "volumeL" = ${u.v.volumeL} WHERE id = '${u.e.id}'`);
    }
    for (const c of toCreate) {
      await db.$executeRawUnsafe(
        `INSERT INTO vessel_component ("tenantId","id","vesselId","varietyId","vineyardId",vintage,"volumeL","createdAt","updatedAt")
         VALUES ('${c.tenantId}', gen_random_uuid()::text, '${c.vesselId}', '${c.varietyId}', '${c.vineyardId}', ${c.vintage}, ${c.volumeL}, now(), now())`,
      );
    }
    console.log(`\n✅ rebuilt: ${toCreate.length} created, ${toUpdate.length} updated, ${toDelete.length} deleted.`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(disconnectSystem);
