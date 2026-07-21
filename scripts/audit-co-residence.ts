/**
 * Co-residence evidence pack (plan 088, Unit 3).
 *
 * For every vessel holding more than one lot, prints what a human needs before authorising a
 * collapse: who is in there, how full the vessel is, the operations that put each lot there,
 * whether any of those lots ALSO live in other vessels, and whether any in-flight work order
 * still points at them.
 *
 * Three of these feed Unit 12's hard pre-flights:
 *   - "also in other vessels"  → a lot-scoped deplete would silently drain the lot's other
 *                                barrels, so those lots must not be absorbed (council C1).
 *   - "in-flight WO tasks"     → a task targeting an absorbed lot crashes at execution (C5).
 *   - "tax class / ownership"  → residents that differ must mint a NEW blend lot rather than
 *                                inherit the survivor's class (TTB 5120.17 lines 5/20, C4).
 *
 * Read-only. NOT wired to CI — the cheap pass/fail gate is `npm run verify:one-lot-per-vessel`.
 * Reads via runAsSystem because vessel_lot is RLS-protected (a pooled client sees zero rows).
 *
 * Run:  npm run audit:co-residence
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

type VesselRow = {
  tenantId: string;
  vesselId: string;
  vesselCode: string;
  vesselType: string;
  capacityL: string;
  filledL: string;
  lotCount: bigint;
};

type ResidentRow = {
  vesselId: string;
  lotId: string;
  lotCode: string;
  displayName: string | null;
  volumeL: string;
  form: string;
  afState: string;
  mlfState: string;
  productType: string;
  carbonation: string;
  ownership: string;
  provenanceComplete: boolean;
  otherVessels: bigint;
};

type HistoryRow = { vesselId: string; opId: number; opType: string; observedAt: Date; lotCode: string; deltaL: string };
type TaskRow = { tenantId: string; taskId: string; title: string; kind: string; opType: string | null; status: string; woStatus: string; lotCode: string };

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "n/a");

async function main() {
  await runAsSystem(async (db) => {
    const vessels = await db.$queryRawUnsafe<VesselRow[]>(`
      SELECT vl."tenantId" AS "tenantId", vl."vesselId" AS "vesselId", v.code AS "vesselCode",
             v.type::text AS "vesselType", v."capacityL"::text AS "capacityL",
             SUM(vl."volumeL")::text AS "filledL", COUNT(*) AS "lotCount"
      FROM vessel_lot vl JOIN vessel v ON v.id = vl."vesselId"
      GROUP BY 1,2,3,4,5 HAVING COUNT(*) > 1
      ORDER BY 1, 3
    `);

    if (vessels.length === 0) {
      console.log("No co-residence. Every vessel holds at most one lot.");
      return;
    }

    const ids = vessels.map((v) => `'${v.vesselId}'`).join(",");

    // otherVessels: how many OTHER vessels this lot also occupies. > 0 blocks a lot-scoped
    // deplete during the collapse, because it would draw down those vessels too.
    const residents = await db.$queryRawUnsafe<ResidentRow[]>(`
      SELECT vl."vesselId" AS "vesselId", l.id AS "lotId", l.code AS "lotCode",
             l."displayName" AS "displayName", vl."volumeL"::text AS "volumeL",
             l.form::text AS form, l."afState"::text AS "afState", l."mlfState"::text AS "mlfState",
             l."productType"::text AS "productType", l.carbonation::text AS carbonation,
             l.ownership::text AS ownership, l."provenanceComplete" AS "provenanceComplete",
             (SELECT COUNT(*) FROM vessel_lot o WHERE o."lotId" = l.id AND o."vesselId" <> vl."vesselId") AS "otherVessels"
      FROM vessel_lot vl JOIN lot l ON l.id = vl."lotId"
      WHERE vl."vesselId" IN (${ids})
      ORDER BY vl."volumeL" DESC
    `);

    const history = await db.$queryRawUnsafe<HistoryRow[]>(`
      SELECT ln."vesselId" AS "vesselId", o.id AS "opId", o.type::text AS "opType",
             o."observedAt" AS "observedAt", ln."lotCode" AS "lotCode", ln."deltaL"::text AS "deltaL"
      FROM lot_operation_line ln JOIN lot_operation o ON o.id = ln."operationId"
      WHERE ln."vesselId" IN (${ids})
      ORDER BY o."observedAt", o.id
    `);

    // In-flight only: DONE / SKIPPED / REJECTED tasks and CANCELLED work orders cannot break.
    const tasks = await db.$queryRawUnsafe<TaskRow[]>(`
      SELECT t."tenantId" AS "tenantId", t.id AS "taskId", t.title, t.kind::text AS kind,
             t."opType"::text AS "opType", t.status::text AS status, w.status::text AS "woStatus",
             l.code AS "lotCode"
      FROM work_order_task t
      JOIN lot l ON l.id = t."lotId"
      JOIN work_order w ON w.id = t."workOrderId"
      WHERE t."lotId" IN (SELECT "lotId" FROM vessel_lot WHERE "vesselId" IN (${ids}))
        AND t.status NOT IN ('DONE','SKIPPED','REJECTED')
        AND w.status <> 'CANCELLED'
      ORDER BY 1, 8
    `);

    let blockedByScope = 0;
    for (const v of vessels) {
      const cap = Number(v.capacityL);
      const filled = Number(v.filledL);
      console.log(`\n${"=".repeat(78)}`);
      console.log(`${v.tenantId}  ·  ${v.vesselType === "BARREL" ? "Barrel" : "Tank"} ${v.vesselCode}`);
      console.log(`${filled} / ${cap} L  (${pct(filled, cap)} full)  ·  ${v.lotCount} lots`);
      console.log("=".repeat(78));

      const mine = residents.filter((r) => r.vesselId === v.vesselId);
      console.log("\n  RESIDENTS (largest first — the default survivor is the top row)");
      for (const [i, r] of mine.entries()) {
        const flags: string[] = [];
        if (Number(r.otherVessels) > 0) {
          flags.push(`⛔ ALSO IN ${r.otherVessels} OTHER VESSEL(S)`);
          if (i > 0) blockedByScope++;
        }
        if (!r.provenanceComplete) flags.push("provenance incomplete");
        console.log(
          `   ${i === 0 ? "→" : " "} ${r.lotCode}${r.displayName ? ` (${r.displayName})` : ""}  ${r.volumeL} L  ` +
            `${pct(Number(r.volumeL), filled)} of the vessel`,
        );
        console.log(
          `      form=${r.form} af=${r.afState} mlf=${r.mlfState} · productType=${r.productType} ` +
            `carbonation=${r.carbonation} ownership=${r.ownership}${flags.length ? `  ${flags.join(" · ")}` : ""}`,
        );
      }

      // Tax class / ownership divergence forces a NEW blend lot rather than an absorb.
      const classes = new Set(mine.map((r) => `${r.productType}/${r.carbonation}`));
      const owners = new Set(mine.map((r) => r.ownership));
      const forms = new Set(mine.map((r) => r.form));
      if (classes.size > 1 || owners.size > 1 || forms.size > 1) {
        console.log(
          `\n  ⚠️  RESIDENTS DIVERGE — ${classes.size > 1 ? "tax class " : ""}${owners.size > 1 ? "ownership " : ""}` +
            `${forms.size > 1 ? "form " : ""}differs. The collapse must MINT A NEW BLEND LOT, not absorb.`,
        );
      }

      const hist = history.filter((h) => h.vesselId === v.vesselId);
      console.log(`\n  LEDGER HISTORY (${hist.length} lines)`);
      for (const h of hist) {
        console.log(
          `      op#${h.opId} ${h.opType.padEnd(10)} ${h.observedAt.toISOString().slice(0, 10)}  ` +
            `${h.lotCode.padEnd(18)} ${h.deltaL.padStart(10)} L`,
        );
      }

      const lotCodes = new Set(mine.map((r) => r.lotCode));
      const mineTasks = tasks.filter((t) => t.tenantId === v.tenantId && lotCodes.has(t.lotCode));
      if (mineTasks.length > 0) {
        console.log(`\n  ⚠️  IN-FLIGHT WORK-ORDER TASKS (${mineTasks.length}) — these break if their lot is absorbed`);
        for (const t of mineTasks) {
          console.log(`      ${t.lotCode.padEnd(18)} [${t.status}/${t.woStatus}] ${t.kind}${t.opType ? `/${t.opType}` : ""} — ${t.title}`);
        }
      }
    }

    const totalTasks = new Set(tasks.map((t) => t.taskId)).size;
    console.log(`\n${"=".repeat(78)}`);
    console.log(`SUMMARY: ${vessels.length} co-resident vessel(s).`);
    console.log(`  ${blockedByScope} non-survivor lot(s) also occupy other vessels → collapse must be vessel-scoped, not lot-scoped.`);
    console.log(`  ${totalTasks} in-flight work-order task(s) reference a co-resident lot.`);
    console.log("=".repeat(78));
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
  });
