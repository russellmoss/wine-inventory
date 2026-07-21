/**
 * LEDGER-12 / plan 088 Unit 18 — the composition READOUT, against live data.
 *
 * The unit tests prove the percentage rules on fixtures. This proves the line a winemaker actually
 * sees: it runs every occupied vessel in every tenant through the same `summarizeVesselComposition`
 * the vessel screens call, and asserts the properties that make the readout trustworthy.
 *
 * Asserted per vessel:
 *   - the collapsed line is non-empty (an occupied vessel always says what it is)
 *   - displayed percentages sum to exactly 100 (no "where did the last 1% go")
 *   - slice volumes reconcile to the vessel's ledger fill
 *   - detail rows are ordered largest-share first
 *   - a vessel whose components fall short surfaces the shortfall rather than renormalising it
 *
 * Read-only. Safe on production data.
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { summarizeVesselComposition } from "@/lib/vessel/composition";

type Row = {
  tenant: string;
  vessel: string;
  lotCode: string;
  fillL: number;
  components: { varietyName: string; vineyardName: string; vintage: number | null; volumeL: number }[];
};

const failures: string[] = [];
function check(cond: boolean, label: string, detail: string) {
  if (!cond) failures.push(`${label}: ${detail}`);
}

runAsSystem(async (db) => {
  const raw = await db.$queryRawUnsafe<
    {
      tenant: string; vessel: string; lotCode: string; fill: string;
      variety: string | null; vineyard: string | null; vintage: number | null; vol: string | null;
    }[]
  >(`
    SELECT o.name AS tenant, v.code AS vessel, l.code AS "lotCode", vl."volumeL"::text AS fill,
           va.name AS variety, vy.name AS vineyard, c.vintage, c."volumeL"::text AS vol
    FROM vessel_lot vl
    JOIN vessel v ON v.id = vl."vesselId"
    JOIN lot l ON l.id = vl."lotId"
    JOIN organization o ON o.id = vl."tenantId"
    LEFT JOIN vessel_component c ON c."vesselId" = v.id
    LEFT JOIN variety va ON va.id = c."varietyId"
    LEFT JOIN vineyard vy ON vy.id = c."vineyardId"
    ORDER BY o.name, v.code
  `);

  const byVessel = new Map<string, Row>();
  for (const r of raw) {
    const key = `${r.tenant}//${r.vessel}`;
    let row = byVessel.get(key);
    if (!row) {
      row = { tenant: r.tenant, vessel: r.vessel, lotCode: r.lotCode, fillL: Number(r.fill), components: [] };
      byVessel.set(key, row);
    }
    if (r.variety && r.vineyard && r.vol != null) {
      row.components.push({ varietyName: r.variety, vineyardName: r.vineyard, vintage: r.vintage, volumeL: Number(r.vol) });
    }
  }

  let incomplete = 0;
  for (const row of [...byVessel.values()].sort((a, b) => a.tenant.localeCompare(b.tenant) || a.vessel.localeCompare(b.vessel))) {
    const at = `${row.tenant} ${row.vessel} (${row.lotCode})`;
    const comp = summarizeVesselComposition(row.fillL, row.components);

    check(comp.summary.length > 0, "occupied vessel states its makeup", `${at} rendered an empty line`);

    const varietyPct = comp.byVariety.reduce((a, s) => a + s.pct, 0);
    check(varietyPct === 100, "collapsed line sums to 100%", `${at} summed to ${varietyPct}%`);
    const detailPct = comp.detail.reduce((a, s) => a + s.pct, 0);
    check(detailPct === 100, "expanded detail sums to 100%", `${at} summed to ${detailPct}%`);

    const sliceL = comp.byVariety.reduce((a, s) => a + s.volumeL, 0);
    check(
      Math.abs(sliceL - row.fillL) <= Math.max(0.05, row.fillL * 1e-4),
      "slices reconcile to the ledger fill",
      `${at} slices ${sliceL.toFixed(2)} L vs fill ${row.fillL.toFixed(2)} L`,
    );

    const ordered = comp.detail.every((s, i) => i === 0 || comp.detail[i - 1].volumeL >= s.volumeL);
    check(ordered, "detail is ordered largest share first", `${at} is out of order`);

    if (!comp.provenanceComplete) {
      incomplete++;
      check(
        comp.byVariety.some((s) => s.unrecorded),
        "a shortfall is shown, never renormalised away",
        `${at} is ${comp.unrecordedL.toFixed(2)} L short but shows no unrecorded slice`,
      );
    }

    console.log(`  ${at.padEnd(46)} ${comp.summary}`);
  }

  console.log(
    `\n${byVessel.size} occupied vessels rendered; ${incomplete} with incomplete provenance (each shows the gap).`,
  );
  if (failures.length > 0) {
    console.error(`\nFAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("ALL VESSEL COMPOSITION READOUT CHECKS PASSED");
  }
})
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(disconnectSystem);
