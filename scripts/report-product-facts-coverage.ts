/**
 * Spray Intelligence S2b Unit 7 — the product-facts coverage report.
 *
 * Answers the question that decides what Wave 2 can actually ship: for how many of the products a
 * grower might spray do we have each fact? Reported PER FIELD, not as one aggregate, because the
 * fields differ a lot and the differences are what gate the downstream phases (KD-11 makes the
 * regulatory and agronomic groups independently shippable).
 *
 * ⚠️ Runbook §12 q5 and the risk register both make this a DECISION INPUT, not just a gate artifact:
 * a low curated share is the trigger for re-evaluating the structured-label-data purchase.
 *
 * The thresholds below were written into the plan BEFORE the first measurement existed (the S0
 * pre-commitment discipline) and are evaluated, not re-negotiated, here.
 *
 * Run: npm run report:product-facts-coverage
 */
import { prisma } from "../src/lib/prisma";
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";

/** Pre-committed in S2b plan v2.2 Unit 7, before any number existed. */
const THRESHOLDS = {
  regulatory: { pct: 80, unblocks: "S7a (legality + rotation)" },
  agronomic: { pct: 60, unblocks: "S6 (protection budget)" },
};

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

async function main() {
  const report = await runAsSystem(async () => {
    // The denominator: products with an ACTIVE grape site registration. This is the population a
    // grower could plausibly spray on grapes, which is what "coverage" has to mean.
    const grapeProducts = await prisma.pesticideProduct.findMany({
      where: { sourceStatus: "ACTIVE", siteRegistrations: { some: { isGrape: true } } },
      select: { epaRegNumber: true, ingredients: { select: { activeIngredient: { select: { name: true } } } } },
    });
    const regNumbers = grapeProducts.map((p) => p.epaRegNumber).filter((r): r is string => !!r);
    const denominator = new Set(regNumbers).size;

    // Curated ACTIVE rows only — a superseded row is history, not coverage.
    const curated = await prisma.pesticideProductFacts.findMany({
      where: { supersededAt: null, epaRegNumber: { in: regNumbers } },
      include: { reiConditions: true, phiConditions: true },
    });

    const now = new Date();
    const withPhi = new Set<string>();
    const withRei = new Set<string>();
    const withRainfast = new Set<string>();
    const withMobility = new Set<string>();
    const proposalsOnly = new Set<string>();
    const stale = new Set<string>();

    for (const row of curated) {
      // A row past review contributes NOTHING to coverage (KD-10) — counting it would report
      // protection we would refuse to serve.
      if (row.reviewDueAt.getTime() < now.getTime()) {
        stale.add(row.epaRegNumber);
        continue;
      }
      // A proposal (reviewedBy null) is NOT curated coverage. The CDPR seed writes these; a human
      // signature is what turns one into a fact (rule §3.1).
      if (!row.reviewedBy) {
        proposalsOnly.add(row.epaRegNumber);
        continue;
      }
      if (row.worstCasePhiDays != null || row.phiConditions.length > 0) withPhi.add(row.epaRegNumber);
      if (row.worstCaseReiHours != null || row.reiConditions.length > 0) withRei.add(row.epaRegNumber);
      if (row.rainfastHours != null) withRainfast.add(row.epaRegNumber);
      if (row.mobilityClass != null) withMobility.add(row.epaRegNumber);
    }

    const bothRegulatory = [...withPhi].filter((r) => withRei.has(r)).length;
    const bothAgronomic = [...withRainfast].filter((r) => withMobility.has(r)).length;

    // The biologicals tail — plan 086 measured it as most of the resistance gap, and it is the
    // number the Cornell-purchase decision is made against.
    const aiCounts = new Map<string, number>();
    for (const p of grapeProducts) for (const i of p.ingredients) aiCounts.set(i.activeIngredient.name, (aiCounts.get(i.activeIngredient.name) ?? 0) + 1);
    const singletonAis = [...aiCounts.values()].filter((c) => c === 1).length;

    return {
      denominator,
      distinctAis: aiCounts.size,
      singletonAis,
      phi: withPhi.size,
      rei: withRei.size,
      rainfast: withRainfast.size,
      mobility: withMobility.size,
      bothRegulatory,
      bothAgronomic,
      proposalsOnly: proposalsOnly.size,
      stale: stale.size,
    };
  });

  const regPct = pct(report.bothRegulatory, report.denominator);
  const agroPct = pct(report.bothAgronomic, report.denominator);

  console.log("\n─── S2b product-facts coverage ───────────────────────────────────");
  console.log(`Denominator: ${report.denominator} distinct ACTIVE grape registrations · ${report.distinctAis} distinct AIs (${report.singletonAis} appear in exactly one product)\n`);
  const row = (label: string, n: number) => console.log(`  ${label.padEnd(34)} ${String(n).padStart(6)}  ${String(pct(n, report.denominator)).padStart(5)}%`);
  row("PHI curated", report.phi);
  row("REI curated", report.rei);
  row("REGULATORY (PHI and REI)", report.bothRegulatory);
  row("rainfast curated", report.rainfast);
  row("mobility class curated", report.mobility);
  row("AGRONOMIC (rainfast and mobility)", report.bothAgronomic);
  console.log("");
  row("proposals awaiting a reviewer", report.proposalsOnly);
  row("rows past reviewDueAt (excluded)", report.stale);

  console.log("\n─── pre-committed thresholds ─────────────────────────────────────");
  const verdict = (name: string, actual: number, t: { pct: number; unblocks: string }) => {
    const met = actual >= t.pct;
    console.log(`  ${met ? "✓ MET  " : "✗ BELOW"}  ${name.padEnd(12)} ${String(actual).padStart(5)}% vs ${t.pct}%  →  ${met ? `${t.unblocks} UNBLOCKED` : `${t.unblocks} waits`}`);
    return met;
  };
  const regMet = verdict("REGULATORY", regPct, THRESHOLDS.regulatory);
  const agroMet = verdict("AGRONOMIC", agroPct, THRESHOLDS.agronomic);
  if (!regMet || !agroMet) {
    console.log("\n  Below a bar is not a failure — the phase still ships what it has, and the deficit");
    console.log("  is the recorded trigger for the structured-label-data purchase decision");
    console.log("  (runbook §12 q5). Everything uncovered resolves to cannot-determine, by design.");
  }

  // Machine-readable line for the monthly cron's issue body (matches the existing grep shape).
  console.log(
    `\n::PESTICIDE_FACTS_SUMMARY:: denominator=${report.denominator} phi=${report.phi} rei=${report.rei} regulatory=${regPct} rainfast=${report.rainfast} mobility=${report.mobility} agronomic=${agroPct} proposals=${report.proposalsOnly} stale=${report.stale}`,
  );

  await disconnectSystem();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
