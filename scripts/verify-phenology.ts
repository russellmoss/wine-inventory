/**
 * Spray Intelligence S4 Unit 10 — verify:phenology.
 *
 * End-to-end proof on the Demo tenant: seeds QA blocks + field notes + daily weather, reads them
 * back THROUGH PRISMA, and runs the real cores over the real persisted JSON. The unit tests prove
 * the math on hand-built fixtures; this proves the round trip — that what the form writes is what
 * the model reads.
 *
 * It also REPORTS the rolling-4-week scouting coverage, which is the number S5b's sour-rot gate
 * consumes (council DQ2). That number is recorded in the phase report WHATEVER IT IS: it is
 * worthless if we only write it down when it flatters us.
 *
 * Run: npm run verify:phenology   (from a checkout with .env — worktrees have none)
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { prisma } from "../src/lib/prisma";
import { parseFieldNoteRow, type BlockStatus } from "../src/lib/fieldnotes/types";
import { estimatePhenologyStageCore, type PhenologyAnchor } from "../src/lib/phenology/stage-core";
import { estimateGrowthCore, type GrowthObservation } from "../src/lib/phenology/growth-core";
import { composePhenologyBlockCore } from "../src/lib/phenology/dto";
import { stageSourceLabel, scoutingLabel } from "../src/lib/phenology/labels";
import {
  clusterDamageApplies,
  vinegarFlyApplies,
  wasScouted,
} from "../src/lib/phenology/observation-types";

const DEMO = "org_demo_winery";
const LAT = 38.5;
const LON = -122.8;

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A block status with the S4 fields, defaulted to "nothing recorded". */
function status(over: Partial<BlockStatus> = {}): BlockStatus {
  return {
    phenoStage: null, phenoStagePct: null, shootTip: null, canopyDensity: null,
    waterStress: null, weedPressure: null, leafConditions: [], diseasePestSpotted: false,
    diseaseDescription: null, photoUrls: [],
    shootLengthCm: null, shootLengthBand: null, hedgedThisWeek: null,
    fruitZoneLeafRemoval: null, clusterDamage: null, vinegarFlyPressure: null,
    ...over,
  };
}

const BIOFIX = "2026-04-15";
const fieldNoteSelect = {
  id: true, vineyardId: true, userId: true, userEmail: true, weekOf: true, weatherData: true,
  spraysApplied: true, fertilizersApplied: true, blockLevelStatuses: true, generalNotes: true,
  aiSummary: true, aiSummaryStatus: true, aiSummaryAt: true, schemaVersion: true, createdAt: true,
} as const;

async function main() {
  await runAsTenant(DEMO, async () => {
    const stamp = Date.now();
    const vy = await prisma.vineyard.create({
      data: { name: `QA-Phenology-${stamp}` },
      select: { id: true, name: true },
    });
    await prisma.vineyardDetail.create({ data: { vineyardId: vy.id, gpsLat: LAT, gpsLng: LON } });

    // Three blocks: the happy path, the 3-week gap, and the block with no bud-break note.
    const mk = (label: string, sortOrder: number) =>
      prisma.vineyardBlock.create({
        data: { vineyardId: vy.id, blockLabel: label, sortOrder, updatedAt: new Date() },
        select: { id: true, blockLabel: true },
      });
    const blkA = await mk("QA-Block-A", 1); // weekly notes, well observed
    const blkB = await mk("QA-Block-B", 2); // a 3-week hole (the named degrade)
    const blkC = await mk("QA-Block-C", 3); // never had bud break recorded
    console.log(`Seeded ${vy.name} with 3 QA blocks`);

    try {
      // ── Weather: 120 days of a constant 10 GDD/day, so every golden is arithmetic. ──────────
      const climate = [];
      for (let i = 0; i < 120; i++) {
        climate.push({
          vineyardId: vy.id,
          providerKey: "gridmet",
          localDate: new Date(`${addDays(BIOFIX, i)}T00:00:00.000Z`),
          tmaxC: "30", tminC: "10", precipMm: "0",
          provenance: { qa: "S4 verify:phenology fixture" },
        });
      }
      await prisma.vineyardClimateDaily.createMany({ data: climate });
      await prisma.vineyardWeatherConfig.create({
        data: {
          vineyardId: vy.id, primaryProviderKey: "gridmet", coverageState: "US_HIGH_RES",
          attribution: "QA fixture", timeZone: "America/Los_Angeles",
        },
      });

      // ── Field notes ─────────────────────────────────────────────────────────────────────────
      // Block A: bud break, then weekly through fruit set, with real growth + scouting.
      // Block B: bud break + flowering, then NOTHING for three weeks.
      // Block C: no bud-break note at all — starts at flowering.
      // Plus one LEGACY 10-field note written exactly as pre-S4 code would have.
      const notes: { weekOf: string; statuses: Record<string, unknown> }[] = [
        {
          weekOf: BIOFIX,
          statuses: {
            [blkA.id]: status({ phenoStage: "BUD_BREAK", phenoStagePct: 25, shootTip: "ACTIVE", shootLengthBand: "LT_10", shootLengthCm: 4 }),
            [blkB.id]: status({ phenoStage: "BUD_BREAK", phenoStagePct: 25, shootTip: "ACTIVE" }),
            // LEGACY SHAPE: exactly the ten keys a pre-S4 row carried, nothing more.
            [blkC.id]: {
              phenoStage: "BUD_BREAK", phenoStagePct: 5, shootTip: "ACTIVE", canopyDensity: "SPARSE",
              waterStress: "NONE", weedPressure: "LOW", leafConditions: [],
              diseasePestSpotted: false, diseaseDescription: null, photoUrls: [],
            },
          },
        },
        {
          weekOf: "2026-05-13",
          statuses: {
            [blkA.id]: status({ phenoStage: "FLOWERING", phenoStagePct: 5, shootTip: "ACTIVE", shootLengthCm: 28, shootLengthBand: "CM_10_30", hedgedThisWeek: false }),
            [blkB.id]: status({ phenoStage: "FLOWERING", phenoStagePct: 5, shootTip: "ACTIVE" }),
            [blkC.id]: status({ phenoStage: "FLOWERING", phenoStagePct: 5, shootTip: "ACTIVE" }),
          },
        },
        {
          weekOf: "2026-05-20",
          statuses: {
            [blkA.id]: status({ phenoStage: "FLOWERING", phenoStagePct: 75, shootTip: "ACTIVE", shootLengthCm: 42, shootLengthBand: "CM_30_60", hedgedThisWeek: false }),
            [blkB.id]: status({ phenoStage: "FLOWERING", phenoStagePct: 50, shootTip: "ACTIVE" }),
            [blkC.id]: status({ phenoStage: "FLOWERING", phenoStagePct: 50, shootTip: "ACTIVE" }),
          },
        },
        {
          weekOf: "2026-05-27",
          statuses: {
            // The hedge week for block A.
            [blkA.id]: status({ phenoStage: "FRUIT_SET", shootTip: "ACTIVE", shootLengthCm: 30, hedgedThisWeek: true, clusterDamage: "NONE" }),
            [blkB.id]: status({ phenoStage: "FRUIT_SET", shootTip: "ACTIVE" }),
            [blkC.id]: status({ phenoStage: "FRUIT_SET", shootTip: "ACTIVE" }),
          },
        },
        {
          weekOf: "2026-06-03",
          statuses: {
            // The week AFTER the hedge: a fresh baseline for the lateral flush.
            [blkA.id]: status({ phenoStage: "FRUIT_SET", shootTip: "ACTIVE", shootLengthCm: 44, clusterDamage: "TRACE", vinegarFlyPressure: null }),
            [blkB.id]: status({ phenoStage: "FRUIT_SET", shootTip: "ACTIVE", clusterDamage: "NOT_ASSESSED" }),
            [blkC.id]: status({ phenoStage: "FRUIT_SET", shootTip: "ACTIVE" }),
          },
        },
      ];
      for (const n of notes) {
        await prisma.fieldNote.create({
          data: {
            vineyardId: vy.id,
            weekOf: new Date(`${n.weekOf}T00:00:00.000Z`),
            userEmail: "qa@demo.test",
            weatherData: { rainfallMm: null, maxTempC: null, minTempC: null },
            spraysApplied: [], fertilizersApplied: [],
            blockLevelStatuses: n.statuses as object,
            schemaVersion: 1, aiSummaryStatus: "PENDING",
          },
        });
      }

      // ── Read back THROUGH the real parser ───────────────────────────────────────────────────
      const rows = await prisma.fieldNote.findMany({
        where: { vineyardId: vy.id }, orderBy: { weekOf: "asc" }, select: fieldNoteSelect,
      });
      const parsed = rows.map(parseFieldNoteRow);
      check("all 5 QA notes round-tripped through the parser", parsed.length === 5, parsed.length);

      console.log("\nBack-compat (no historical migration):");
      const legacy = parsed[0].blockLevelStatuses[blkC.id];
      check("a LEGACY 10-field row parses without throwing", legacy !== undefined);
      check("...and yields null for every S4 field, never a default", (
        legacy.shootLengthCm === null && legacy.shootLengthBand === null &&
        legacy.hedgedThisWeek === null && legacy.fruitZoneLeafRemoval === null &&
        legacy.clusterDamage === null && legacy.vinegarFlyPressure === null
      ), legacy);
      check("...while its ten original fields survive unchanged", legacy.phenoStage === "BUD_BREAK" && legacy.canopyDensity === "SPARSE");
      const roundTripped = parsed[4].blockLevelStatuses[blkA.id];
      check("a written S4 field survives the DB round trip", roundTripped.shootLengthCm === 44 && roundTripped.clusterDamage === "TRACE", roundTripped);
      check("hedgedThisWeek: false persisted as false, not lost to null", parsed[1].blockLevelStatuses[blkA.id].hedgedThisWeek === false);

      // ── Build the core inputs from the PERSISTED rows ───────────────────────────────────────
      const climateRows = await prisma.vineyardClimateDaily.findMany({
        where: { vineyardId: vy.id, providerKey: "gridmet" },
        select: { localDate: true, tmaxC: true, tminC: true, precipMm: true, rhMaxPct: true, rhMinPct: true },
        orderBy: { localDate: "asc" },
      });
      const dailyRecords = climateRows.map((r) => ({
        localDate: r.localDate.toISOString().slice(0, 10),
        tmaxC: r.tmaxC === null ? null : Number(r.tmaxC),
        tminC: r.tminC === null ? null : Number(r.tminC),
        precipMm: r.precipMm === null ? null : Number(r.precipMm),
        rhMaxPct: null, rhMinPct: null,
      }));
      const anchorsFor = (blockId: string): PhenologyAnchor[] =>
        parsed
          .filter((n) => n.blockLevelStatuses[blockId]?.phenoStage != null)
          .map((n) => ({
            date: n.weekOf,
            stage: n.blockLevelStatuses[blockId].phenoStage!,
            stagePct: n.blockLevelStatuses[blockId].phenoStagePct,
          }));
      const obsFor = (blockId: string): GrowthObservation[] =>
        parsed
          .filter((n) => n.blockLevelStatuses[blockId] !== undefined)
          .map((n) => {
            const s = n.blockLevelStatuses[blockId];
            return { date: n.weekOf, shootLengthCm: s.shootLengthCm, shootLengthBand: s.shootLengthBand, shootTip: s.shootTip, hedgedThisWeek: s.hedgedThisWeek };
          });
      const stageOn = (blockId: string, targetDate: string) =>
        estimatePhenologyStageCore({ anchors: anchorsFor(blockId), dailyRecords, latitude: LAT, targetDate });

      // ── The interpolator, on real persisted anchors ─────────────────────────────────────────
      console.log("\nInterpolator:");
      const offDay = stageOn(blkA.id, "2026-05-16"); // a Saturday between two notes
      check("an OFF-DAY stage is INTERPOLATED, not refused", offDay.source === "INTERPOLATED", offDay.reasonCode ?? offDay.source);
      check("...and is labelled with the estimator AND its anchor age", (() => {
        const label = stageSourceLabel(offDay.source, offDay.anchorAgeDays);
        return label.toLowerCase().includes("estimated") && label.includes("days ago");
      })(), stageSourceLabel(offDay.source, offDay.anchorAgeDays));
      check("GDD accumulates from the bud-break biofix, not a calendar date", offDay.biofixDate === BIOFIX, offDay.biofixDate);
      check("...and the total is the hand-computed 10 GDD/day", offDay.gddSinceBiofix === 320, offDay.gddSinceBiofix);

      const observedDay = stageOn(blkA.id, "2026-05-20");
      check("a stage ON a note date is OBSERVED, verbatim", observedDay.source === "OBSERVED" && observedDay.stagePct === 75, observedDay);

      const gap = stageOn(blkB.id, "2026-06-24"); // 21 days past the 2026-06-03 note
      check("THE NAMED DEGRADE: no field note for 3 weeks in a fast phase ⇒ refuse", gap.stage === null && gap.reasonCode === "ANCHOR_TOO_OLD", gap);
      check("...and the refusal carries a reason, not a bare null", !!gap.reason && gap.reason.includes("Walk the block"), gap.reason);

      const noBiofix = estimatePhenologyStageCore({
        anchors: anchorsFor(blkC.id).filter((a) => a.stage !== "BUD_BREAK"),
        dailyRecords, latitude: LAT, targetDate: "2026-05-25",
      });
      check("a block with NO bud-break note REFUSES — never assumes Apr 1 (D11/C9)", noBiofix.stage === null && noBiofix.reasonCode === "NO_BIOFIX", noBiofix);

      // ── The growth model, on real persisted observations ────────────────────────────────────
      console.log("\nGrowth model:");
      const growA = estimateGrowthCore({ observations: obsFor(blkA.id), sinceDate: "2026-05-13", targetDate: "2026-05-20" });
      check("measured growth matches the golden: 28 → 42 cm in 7 days = 14 cm/week", growA.cmPerWeek === 14, growA.cmPerWeek);
      check("...and a third of leaf area is new since the spray", Math.abs((growA.unprotectedNewLeafFraction ?? 0) - 14 / 42) < 0.001, growA.unprotectedNewLeafFraction);

      const hedgeSpan = estimateGrowthCore({ observations: obsFor(blkA.id), sinceDate: "2026-05-20", targetDate: "2026-05-27" });
      check("a HEDGE span refuses — never a negative and never a zero", (
        hedgeSpan.reasonCode === "HEDGE_IN_SPAN" && hedgeSpan.cmPerWeek === null && hedgeSpan.unprotectedNewLeafFraction === null
      ), hedgeSpan);

      const afterHedge = estimateGrowthCore({ observations: obsFor(blkA.id), sinceDate: "2026-05-27", targetDate: "2026-06-03" });
      check("the week AFTER the hedge recovers on a fresh baseline", afterHedge.reasonCode === null && afterHedge.cmPerWeek === 14, afterHedge);
      check("the ≥10 cm threshold is answered exactly throughout", afterHedge.shootsAtLeast10cm === true);

      // ── The composed DTO ────────────────────────────────────────────────────────────────────
      console.log("\nRead DTO:");
      const s = parsed[4].blockLevelStatuses[blkA.id];
      const dto = composePhenologyBlockCore({
        blockId: blkA.id, blockLabel: blkA.blockLabel!,
        stage: stageOn(blkA.id, "2026-06-05"), growth: afterHedge,
        trellisSystem: null, blockCompactness: null, varietyCompactness: null,
        fruitZoneLeafRemoval: s.fruitZoneLeafRemoval, hedgedThisWeek: s.hedgedThisWeek,
        clusterDamage: s.clusterDamage, vinegarFlyPressure: s.vinegarFlyPressure,
      });
      check("fruitPresent is derived AND inherits the stage's provenance", dto.fruitPresent === true && dto.fruitPresentSource === dto.stageSource, dto.fruitPresent);
      check("compactness with nothing recorded resolves to UNKNOWN, never a default", dto.clusterCompactness === null && dto.clusterCompactnessSource === "UNKNOWN");
      check("an unscouted field is flagged as a gap", dto.honesty.scoutingGap === true && dto.vinegarFlyScouted === false);
      check("a null scouting value renders as 'nobody has checked', never as none", scoutingLabel("vinegarFlyPressure", null).includes("nobody has checked"));

      // ── The number S5b's sour-rot gate reads (council DQ2) ───────────────────────────────────
      // Rolling FOUR WEEKS, not a season-wide share: a grower who skipped all of August but filled
      // September could clear a seasonal 60% while missing the entire pathogen build-up.
      console.log("\nRolling 4-week scouting coverage (S5b sour-rot gate input):");
      const coverage = await measureScoutingCoverage();
      for (const line of coverage.lines) console.log(`  ${line}`);
      check("coverage is measured and reported (whatever the number)", typeof coverage.overallPct === "number");
    } finally {
      await prisma.fieldNote.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardClimateDaily.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardWeatherConfig.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardBlock.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardDetail.deleteMany({ where: { vineyardId: vy.id } }).catch(() => {});
      await prisma.vineyard.delete({ where: { id: vy.id } });
      console.log("\nCleaned up QA fixtures.");
    }
  });
  await prisma.$disconnect();
  console.log(failures === 0 ? "\n✓ verify:phenology PASSED" : `\n✗ verify:phenology FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Census of the scouting pair across EVERY tenant, over the trailing 4 weeks.
 *
 * Read-only, via runAsSystem, because the honest programme-level number spans tenants and a
 * per-tenant read would only ever see the sandbox. QA fixtures are excluded by name so a verify
 * run cannot inflate its own gate input.
 *
 * DENOMINATOR: block-week observations where the control WOULD HAVE RENDERED — i.e. the block was
 * at or past the gating stage. A grower cannot be faulted for not scouting a block at bud break,
 * and counting those would understate coverage rather than measure it.
 */
async function measureScoutingCoverage(): Promise<{ overallPct: number; lines: string[] }> {
  const since = new Date(Date.now() - 28 * 86_400_000);
  const lines: string[] = [];
  let gatedDamage = 0, scoutedDamage = 0, gatedFly = 0, scoutedFly = 0, blockWeeks = 0;

  await runAsSystem(async (db) => {
    const rows = await db.fieldNote.findMany({
      where: { weekOf: { gte: since } },
      select: { weekOf: true, blockLevelStatuses: true, vineyard: { select: { name: true } } },
    });
    for (const row of rows) {
      if (row.vineyard?.name?.startsWith("QA-")) continue; // never let a verify run inflate its own gate
      const statuses = (row.blockLevelStatuses ?? {}) as Record<string, Record<string, unknown>>;
      for (const s of Object.values(statuses)) {
        blockWeeks += 1;
        const stage = typeof s.phenoStage === "string" ? s.phenoStage : null;
        const damage = (s.clusterDamage ?? null) as never;
        const fly = (s.vinegarFlyPressure ?? null) as never;
        if (clusterDamageApplies(stage)) {
          gatedDamage += 1;
          if (wasScouted(damage)) scoutedDamage += 1;
        }
        if (vinegarFlyApplies(stage)) {
          gatedFly += 1;
          if (wasScouted(fly)) scoutedFly += 1;
        }
      }
    }
  });

  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  const gatedTotal = gatedDamage + gatedFly;
  const scoutedTotal = scoutedDamage + scoutedFly;
  const overallPct = pct(scoutedTotal, gatedTotal);
  lines.push(`window: trailing 28 days to ${new Date().toISOString().slice(0, 10)} (all tenants, QA-* excluded)`);
  lines.push(`block-week observations in window: ${blockWeeks}`);
  lines.push(`cluster damage:      ${scoutedDamage}/${gatedDamage} gated observations scouted (${pct(scoutedDamage, gatedDamage)}%)`);
  lines.push(`vinegar-fly pressure: ${scoutedFly}/${gatedFly} gated observations scouted (${pct(scoutedFly, gatedFly)}%)`);
  lines.push(`OVERALL: ${scoutedTotal}/${gatedTotal} (${overallPct}%) — S5b builds sour rot only above 60%`);
  if (gatedTotal === 0) {
    lines.push("NOTE: denominator is ZERO — no block reached FRUIT_SET in the window, so this is");
    lines.push("      'not yet measurable', NOT 0% coverage. S5b must treat it as unknown, not as a fail.");
  }
  return { overallPct, lines };
}

main().catch((e) => {
  console.error("verify:phenology ERROR", e);
  process.exit(1);
});
