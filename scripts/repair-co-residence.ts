/**
 * Collapse the vessels that hold more than one lot (plan 088, Unit 12).
 *
 * A vessel holds one cohesive liquid. Where the live data says otherwise, the largest-volume
 * resident ABSORBS the others through a real BLEND operation — never row surgery, because
 * LEDGER-10 makes operations immutable and history append-only, and because a hand-edited
 * projection would silently desync cost, lineage and the TTB folds.
 *
 * VESSEL-SCOPED. The draw is keyed on (vesselId, lotId), so a lot that also lives in OTHER
 * vessels keeps every one of those positions untouched. That matters here: all six non-survivor
 * lots occupy other vessels too (one of them five others). The dry run prints those positions
 * before and after precisely so the claim is checked rather than trusted.
 *
 * Pre-flights, each of which ABORTS the vessel rather than guessing:
 *   1. in-flight work-order tasks pointing at a lot that is about to be absorbed
 *      (they would crash at execution) — override with --rewrite-tasks
 *   2. residents that differ in tax class, ownership, bond or form — absorbing would make one
 *      wine inherit the other's identity, which is a TTB 5120.17 misstatement, so those need a
 *      new blend lot and a human decision rather than an automatic merge
 *
 * ⚠️ .env IS PRODUCTION on this repo. --dry-run is the default; --apply additionally requires an
 * explicit --tenant, so nothing sweeps every winery at once.
 *
 * Run:
 *   npm run repair:co-residence                                  # dry run, all tenants
 *   npm run repair:co-residence -- --apply --tenant org_demo_winery
 *   npm run repair:co-residence -- --survivor <vesselId>=<lotId> # override the survivor
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { loadCombineState } from "@/lib/ledger/combine-state";
import { decideCombineRoute } from "@/lib/ledger/combine";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@repair-co-residence" };
const r2 = (n: number) => Math.round(n * 100) / 100;

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const REWRITE_TASKS = argv.includes("--rewrite-tasks");
const TENANT = argv.find((a) => a.startsWith("--tenant="))?.split("=")[1] ?? null;
const SURVIVORS = new Map(
  argv
    .filter((a) => a.startsWith("--survivor="))
    .map((a) => a.slice("--survivor=".length).split("="))
    .filter((p): p is [string, string] => p.length === 2),
);

type Row = {
  tenantId: string;
  vesselId: string;
  vesselCode: string;
  vesselType: string;
  lotId: string;
  lotCode: string;
  volumeL: string;
  productType: string;
  carbonation: string;
  ownership: string;
  form: string;
};

type Resident = { lotId: string; lotCode: string; volumeL: number; productType: string; carbonation: string; ownership: string; form: string };
type Target = { tenantId: string; vesselId: string; label: string; residents: Resident[] };

async function loadTargets(): Promise<Target[]> {
  const rows = await runAsSystem((db) =>
    db.$queryRawUnsafe<Row[]>(`
      SELECT vl."tenantId" AS "tenantId", vl."vesselId" AS "vesselId", v.code AS "vesselCode",
             v.type::text AS "vesselType", vl."lotId" AS "lotId", l.code AS "lotCode",
             vl."volumeL"::text AS "volumeL", l."productType"::text AS "productType",
             l.carbonation::text AS carbonation, l.ownership::text AS ownership, l.form::text AS form
      FROM vessel_lot vl JOIN vessel v ON v.id = vl."vesselId" JOIN lot l ON l.id = vl."lotId"
      WHERE vl."vesselId" IN (
        SELECT "vesselId" FROM vessel_lot GROUP BY "tenantId", "vesselId" HAVING COUNT(*) > 1
      )
      ORDER BY vl."tenantId", v.code, vl."volumeL" DESC
    `),
  );
  const byVessel = new Map<string, Target>();
  for (const r of rows) {
    const t = byVessel.get(r.vesselId) ?? {
      tenantId: r.tenantId,
      vesselId: r.vesselId,
      label: `${r.vesselType === "BARREL" ? "Barrel" : "Tank"} ${r.vesselCode}`,
      residents: [],
    };
    t.residents.push({
      lotId: r.lotId,
      lotCode: r.lotCode,
      volumeL: Number(r.volumeL),
      productType: r.productType,
      carbonation: r.carbonation,
      ownership: r.ownership,
      form: r.form,
    });
    byVessel.set(r.vesselId, t);
  }
  return [...byVessel.values()];
}

/** Every OTHER vessel these lots occupy — the positions the collapse must leave alone. */
async function otherPositions(lotIds: string[], exceptVesselId: string) {
  if (lotIds.length === 0) return [];
  return runAsSystem((db) =>
    db.$queryRawUnsafe<{ lotCode: string; vesselCode: string; volumeL: string }[]>(`
      SELECT l.code AS "lotCode", v.code AS "vesselCode", vl."volumeL"::text AS "volumeL"
      FROM vessel_lot vl JOIN vessel v ON v.id = vl."vesselId" JOIN lot l ON l.id = vl."lotId"
      WHERE vl."lotId" IN (${lotIds.map((id) => `'${id}'`).join(",")})
        AND vl."vesselId" <> '${exceptVesselId}'
      ORDER BY 1, 2
    `),
  );
}

async function inFlightTasks(lotIds: string[]) {
  if (lotIds.length === 0) return [];
  return runAsSystem((db) =>
    db.$queryRawUnsafe<{ taskId: string; title: string; status: string; woStatus: string; lotCode: string }[]>(`
      SELECT t.id AS "taskId", t.title, t.status::text AS status, w.status::text AS "woStatus", l.code AS "lotCode"
      FROM work_order_task t JOIN lot l ON l.id = t."lotId" JOIN work_order w ON w.id = t."workOrderId"
      WHERE t."lotId" IN (${lotIds.map((id) => `'${id}'`).join(",")})
        AND t.status NOT IN ('DONE','SKIPPED','REJECTED') AND w.status <> 'CANCELLED'
    `),
  );
}

async function main() {
  const targets = await loadTargets();
  console.log(`\n${"═".repeat(78)}`);
  console.log(`ONE LOT PER VESSEL — ${APPLY ? "APPLY" : "DRY RUN"}${TENANT ? `  ·  tenant ${TENANT}` : "  ·  all tenants"}`);
  console.log("═".repeat(78));

  if (targets.length === 0) {
    console.log("\nNothing to do — every vessel already holds at most one lot.");
    return;
  }

  const scoped = TENANT ? targets.filter((t) => t.tenantId === TENANT) : targets;
  if (APPLY && !TENANT) {
    console.error("\nREFUSED: --apply requires an explicit --tenant=<id>. Repair one winery at a time.");
    process.exitCode = 1;
    return;
  }

  let plannedCount = 0;
  let blockedCount = 0;

  for (const t of scoped) {
    const total = r2(t.residents.reduce((a, r) => a + r.volumeL, 0));
    const override = SURVIVORS.get(t.vesselId);
    const survivor = override ? t.residents.find((r) => r.lotId === override) : t.residents[0]; // rows arrive volume-desc
    console.log(`\n${"─".repeat(78)}`);
    console.log(`${t.tenantId}  ·  ${t.label}  ·  ${t.residents.length} lots, ${total} L`);
    console.log("─".repeat(78));

    if (!survivor) {
      console.log(`  ⛔ BLOCKED — --survivor names a lot that isn't in this vessel.`);
      blockedCount++;
      continue;
    }
    const losers = t.residents.filter((r) => r.lotId !== survivor.lotId);

    console.log(`  SURVIVOR   ${survivor.lotCode}  ${survivor.volumeL} L${override ? "  (overridden)" : "  (largest)"}`);
    for (const l of losers) console.log(`  absorbed   ${l.lotCode}  ${l.volumeL} L`);
    console.log(`  RESULT     ${survivor.lotCode} holds ${total} L; ${t.label} holds 1 lot`);

    // The other positions this must NOT touch. Printed BEFORE the pre-flights on purpose: the
    // vessels most likely to be blocked are exactly the ones whose lots are spread around, and
    // that is the evidence a reviewer needs to see.
    const others = await otherPositions(losers.map((l) => l.lotId), t.vesselId);
    if (others.length > 0) {
      console.log(`  UNTOUCHED  these lots also sit elsewhere; the draw is keyed on (vessel, lot), so they stay put:`);
      for (const o of others) console.log(`       ${o.lotCode} in ${o.vesselCode}: ${o.volumeL} L`);
    }

    // ── Pre-flight 1: residents must be the same kind of thing ────────────────
    const state = await runAsTenant(t.tenantId, () =>
      loadCombineState({ toVesselId: t.vesselId, incomingLotIds: losers.map((l) => l.lotId) }),
    );
    const decision = decideCombineRoute({
      destResidentLots: state.destResidentLots.filter((s) => s.lotId === survivor.lotId),
      incoming: state.incoming,
    });
    if (!decision.ok && decision.reason !== "multi-incoming-needs-new-blend") {
      console.log(`  ⛔ BLOCKED — ${decision.message}`);
      console.log(`     These are not the same wine in the eyes of the cellar or the TTB. Needs a human decision.`);
      blockedCount++;
      continue;
    }

    // ── Pre-flight 2: in-flight work orders ───────────────────────────────────
    const tasks = await inFlightTasks(losers.map((l) => l.lotId));
    if (tasks.length > 0) {
      console.log(`  ⚠️  ${tasks.length} in-flight work-order task(s) point at a lot being absorbed:`);
      for (const task of tasks) console.log(`       ${task.lotCode}  [${task.status}/${task.woStatus}]  ${task.title}`);
      if (!REWRITE_TASKS) {
        console.log(`     ⛔ BLOCKED — resolve them, or re-run with --rewrite-tasks to re-point them at ${survivor.lotCode}.`);
        blockedCount++;
        continue;
      }
      console.log(`     → --rewrite-tasks: they will be re-pointed at ${survivor.lotCode}.`);
    }

    plannedCount++;
    if (!APPLY) {
      console.log(`  → would write ONE BLEND op (grow ${survivor.lotCode}), vessel-scoped.`);
      continue;
    }

    // ── Apply ────────────────────────────────────────────────────────────────
    await runAsTenant(t.tenantId, async () => {
      if (tasks.length > 0 && REWRITE_TASKS) {
        await prisma.workOrderTask.updateMany({
          where: { id: { in: tasks.map((x) => x.taskId) } },
          data: { lotId: survivor.lotId },
        });
        console.log(`     re-pointed ${tasks.length} task(s) at ${survivor.lotCode}`);
      }
      const res = await blendLotsCore(ACTOR, {
        mode: "GROW_EXISTING",
        growIntoLotId: survivor.lotId,
        toVesselId: t.vesselId,
        // deplete is keyed on (vesselId, lotId) — this vessel's position only.
        components: losers.map((l) => ({ vesselId: t.vesselId, lotId: l.lotId, drawL: l.volumeL, deplete: true })),
        note: `One lot per vessel (LEDGER-12): ${survivor.lotCode} absorbed ${losers.map((l) => l.lotCode).join(", ")} in ${t.label}.`,
      });
      console.log(`  ✅ APPLIED — op #${res.operationId}, ${res.lineageEdges} lineage edge(s), ${res.childCode} now ${r2(res.childTotalL)} L`);
    });
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log(`${plannedCount} vessel(s) ${APPLY ? "collapsed" : "ready to collapse"}, ${blockedCount} blocked.`);
  if (!APPLY && plannedCount > 0) {
    console.log(`Re-run with --apply --tenant=<id> to write. Reversible until the invariant is switched on.`);
  }
  console.log("═".repeat(78));
}

main()
  .catch((e) => {
    console.error("\nFAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
    await prisma.$disconnect();
  });
