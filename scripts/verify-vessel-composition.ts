/**
 * "What's actually in this tank" — vessel_component composition, proven against the live DB
 * (plan 088, Unit 5).
 *
 * The bug this exists to pin down: syncVesselComponents keyed a line's contribution on the
 * lot's OWN origin tuple and skipped anything without one. A blend lot has no origin by
 * construction ("origin* stay NULL — a multi-source blend has no single origin"), so every
 * blend-lot line contributed NOTHING and the tank's breakdown silently decayed. Harmless while
 * blends were rare; load-bearing now that every combine defaults to absorbing into the resident
 * lot, and the vessel screen shows this breakdown to answer "where did my Cabernet go?".
 *
 * Drives the REAL cores (blendLotsCore, rackVesselCore) with an explicit actor. Everything it
 * creates is QA-prefixed and scrubbed in a finally block, on the Demo tenant only.
 *
 * Run:  npm run verify:vessel-composition
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { rackVesselCore } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-vessel-composition" };
const r2 = (n: number) => Math.round(n * 100) / 100;

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const createdLotIds: string[] = [];

async function makeVineyard(name: string): Promise<string> {
  const v = (await prisma.vineyard.findFirst({ where: { name } })) ?? (await prisma.vineyard.create({ data: { name } }));
  return v.id;
}
async function makeVariety(name: string): Promise<string> {
  const v = (await prisma.variety.findFirst({ where: { name } })) ?? (await prisma.variety.create({ data: { name } }));
  return v.id;
}
async function makeVessel(code: string, capacityL: number): Promise<string> {
  const existing = await prisma.vessel.findFirst({ where: { code, type: "TANK" } });
  if (existing) return existing.id;
  const v = await prisma.vessel.create({ data: { code, type: "TANK", capacityL } });
  return v.id;
}

/** Seed a SINGLE-ORIGIN lot (variety + vineyard + vintage) into a vessel. */
async function seedLot(
  code: string,
  vesselId: string,
  volumeL: number,
  origin: { varietyId: string; vineyardId: string; vintage: number },
): Promise<string> {
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const lot = await prisma.lot.create({
    data: {
      code,
      form: "WINE",
      originVarietyId: origin.varietyId,
      originVineyardId: origin.vineyardId,
      vintageYear: origin.vintage,
    },
  });
  createdLotIds.push(lot.id);
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId: origin.vineyardId } });
  const lines: LedgerLine[] = [
    { lotId: lot.id, vesselId, deltaL: volumeL },
    { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
  ];
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines,
      actorUserId: null,
      enteredBy: ACTOR.actorEmail,
      note: "verify-vessel-composition seed",
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map([[vesselId, vessel.code]]),
      capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

type Comp = { varietyId: string; vineyardId: string; vintage: number; volumeL: number };
async function composition(vesselId: string): Promise<Comp[]> {
  const rows = await prisma.vesselComponent.findMany({ where: { vesselId }, orderBy: { volumeL: "desc" } });
  return rows.map((r) => ({ varietyId: r.varietyId, vineyardId: r.vineyardId, vintage: r.vintage, volumeL: r2(Number(r.volumeL)) }));
}
async function vesselVolume(vesselId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId } });
  return r2(rows.reduce((a, r) => a + Number(r.volumeL), 0));
}
const shareOf = (comps: Comp[], varietyId: string) => r2(comps.filter((c) => c.varietyId === varietyId).reduce((a, c) => a + c.volumeL, 0));

async function scrub() {
  const patternLots = await prisma.lot.findMany({
    where: { OR: [{ code: { startsWith: "QA-VC-" } }, { code: { contains: "-BL-QVC" } }] },
    select: { id: true },
  });
  const allLotIds = [...new Set([...createdLotIds, ...patternLots.map((l) => l.id)])];
  await prisma.lotOperationLine.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: allLotIds } }, { childLotId: { in: allLotIds } }] } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  const orphanOps = await prisma.lotOperation.findMany({ where: { lines: { none: {} }, enteredBy: ACTOR.actorEmail }, select: { id: true } });
  await prisma.lotOperation.deleteMany({ where: { id: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } }).catch(() => {});
  const qaVessels = await prisma.vessel.findMany({ where: { code: { startsWith: "QA-VC-" } }, select: { id: true } });
  await prisma.vesselComponent.deleteMany({ where: { vesselId: { in: qaVessels.map((v) => v.id) } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "QA-VC-" } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { name: { startsWith: "QA-VC Vineyard" } } }).catch(() => {});
}

async function main() {
  const vyA = await makeVineyard("QA-VC Vineyard A");
  const vyB = await makeVineyard("QA-VC Vineyard B");
  const pinot = await makeVariety("Pinot Noir");
  const syrah = await makeVariety("Syrah");
  const cab = await makeVariety("Cabernet Sauvignon");

  // ── 1. Baseline: a single-origin lot contributes its own tuple ──────────────
  console.log("\n1. Single-origin lot");
  const t1 = await makeVessel("QA-VC-T1", 2000);
  await seedLot("QA-VC-PN", t1, 1000, { varietyId: pinot, vineyardId: vyA, vintage: 2024 });
  const c1 = await composition(t1);
  assert(c1.length === 1 && c1[0].varietyId === pinot && c1[0].volumeL === 1000, "single-origin lot writes one component tuple at full volume");

  // ── 2. THE BUG: a BLEND lot has no origin, so its wine used to vanish ───────
  console.log("\n2. Blend lot (origin* NULL) — the case that produced NOTHING before the fix");
  const t2 = await makeVessel("QA-VC-T2", 2000);
  const t3 = await makeVessel("QA-VC-T3", 2000);
  await seedLot("QA-VC-CS", t2, 500, { varietyId: cab, vineyardId: vyB, vintage: 2024 });

  // Blend 700 L Pinot + 300 L Cab into an empty tank → a NEW child lot with NO origin.
  const blendDest = await makeVessel("QA-VC-BL", 3000);
  const pnLot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-PN" } })).id;
  const csLot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-CS" } })).id;
  const blend = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "QVC",
    vintage: 2024,
    components: [
      { vesselId: t1, lotId: pnLot, drawL: 700 },
      { vesselId: t2, lotId: csLot, drawL: 300 },
    ],
    toVesselId: blendDest,
  });
  createdLotIds.push(blend.childLotId);

  const child = await prisma.lot.findUniqueOrThrow({ where: { id: blend.childLotId } });
  assert(
    child.originVarietyId === null && child.originVineyardId === null,
    "the blend child has NO origin tuple of its own (this is what the old fold skipped)",
  );

  const cBlend = await composition(blendDest);
  assert(cBlend.length === 2, "the blend vessel gets a component row per ANCESTOR LEAF, not zero rows");
  assert(shareOf(cBlend, pinot) === 700, "Pinot attributed 700 L by lineage fraction");
  assert(shareOf(cBlend, cab) === 300, "Cabernet attributed 300 L by lineage fraction");
  assert(
    r2(cBlend.reduce((a, c) => a + c.volumeL, 0)) === (await vesselVolume(blendDest)),
    "composition sums to the vessel's actual volume — no wine invented or lost",
  );

  // ── 3. Moving blended wine keeps the breakdown honest ───────────────────────
  console.log("\n3. Racking the blend on");
  await rackVesselCore(ACTOR, { fromVesselId: blendDest, toVesselId: t3, drawL: 400 });
  const cT3 = await composition(t3);
  assert(shareOf(cT3, pinot) === 280, "racking 400 L of a 70/30 blend carries 280 L Pinot");
  assert(shareOf(cT3, cab) === 120, "…and 120 L Cabernet");
  assert(r2(cT3.reduce((a, c) => a + c.volumeL, 0)) === (await vesselVolume(t3)), "destination composition sums to its volume");

  const cBlendAfter = await composition(blendDest);
  assert(
    r2(cBlendAfter.reduce((a, c) => a + c.volumeL, 0)) === (await vesselVolume(blendDest)),
    "source composition shrinks to match what is left",
  );

  // ── 4. A blend of a blend — fractions multiply down the chain ───────────────
  console.log("\n4. Three-deep blend chain");
  const t4 = await makeVessel("QA-VC-T4", 2000);
  const deepDest = await makeVessel("QA-VC-D1", 3000);
  await seedLot("QA-VC-PN2", t4, 600, { varietyId: pinot, vineyardId: vyA, vintage: 2024 });
  const pn2Lot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-PN2" } })).id;
  // 500 L of the 70/30 child + 500 L straight Pinot → expect Pinot 350+500=850, Cab 150.
  const deep = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "QVD",
    vintage: 2024,
    components: [
      { vesselId: blendDest, lotId: blend.childLotId, drawL: 500 },
      { vesselId: t4, lotId: pn2Lot, drawL: 500 },
    ],
    toVesselId: deepDest,
  });
  createdLotIds.push(deep.childLotId);

  const cDeep = await composition(deepDest);
  assert(shareOf(cDeep, pinot) === 850, "a blend-of-a-blend multiplies fractions down the chain (Pinot 850 L)");
  assert(shareOf(cDeep, cab) === 150, "…and the grandparent Cabernet survives at 150 L");
  assert(r2(cDeep.reduce((a, c) => a + c.volumeL, 0)) === (await vesselVolume(deepDest)), "deep-chain composition sums to volume");

  // ── 5. ABSORB into a lot that HAS its own origin — the Unit 12b case ────────
  // This is the mirror of case 2 and it was wrong in the opposite direction: the fold
  // short-circuited on the resident's own origin tuple, so wine absorbed INTO a single-origin lot
  // was credited to that lot's variety. A 6,370 L Syrah lot absorbing 625 L of Cabernet reported
  // 100% Syrah — "where did my Cabernet go?".
  console.log("\n5. Absorb into a single-origin lot (grow-existing)");
  const t5 = await makeVessel("QA-VC-T5", 12000);
  const t6 = await makeVessel("QA-VC-T6", 2000);
  await seedLot("QA-VC-SY", t5, 6370, { varietyId: syrah, vineyardId: vyA, vintage: 2026 });
  await seedLot("QA-VC-CS2", t6, 625, { varietyId: cab, vineyardId: vyB, vintage: 2026 });
  const syLot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-SY" } })).id;
  const cs2Lot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-CS2" } })).id;

  await blendLotsCore(ACTOR, {
    mode: "GROW_EXISTING",
    toVesselId: t5,
    components: [{ vesselId: t6, lotId: cs2Lot, drawL: 625, deplete: true }],
  });

  const cGrow = await composition(t5);
  assert((await vesselVolume(t5)) === 6995, "the resident grew to 6995 L (6370 + 625)");
  assert(shareOf(cGrow, syrah) === 6370, "the resident's OWN 6370 L stays Syrah");
  assert(shareOf(cGrow, cab) === 625, "the absorbed 625 L is still CABERNET, not swallowed by Syrah");
  assert(
    r2(cGrow.reduce((a, c) => a + c.volumeL, 0)) === (await vesselVolume(t5)),
    "composition sums to the vessel volume after an absorb",
  );

  // The lineage fraction must be the parent's share of the RESULT (625/6995 ≈ 0.0893), not of the
  // incoming wine (which was 1.0 and made the tank read as 100% of one variety).
  const growEdge = await prisma.lotLineage.findFirstOrThrow({ where: { parentLotId: cs2Lot, childLotId: syLot } });
  const frac = Number(growEdge.fraction);
  assert(Math.abs(frac - 625 / 6995) < 1e-3, `grow fraction is the parent's share of the RESULT (${frac.toFixed(5)} ≈ 0.08935)`);

  // ── 6. A second absorb dilutes the first — fractions must not drift past 1 ──
  console.log("\n6. A second absorb into the same lot");
  const t8 = await makeVessel("QA-VC-T8", 2000);
  await seedLot("QA-VC-PN3", t8, 1000, { varietyId: pinot, vineyardId: vyA, vintage: 2026 });
  const pn3Lot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-PN3" } })).id;
  await blendLotsCore(ACTOR, {
    mode: "GROW_EXISTING",
    toVesselId: t5,
    components: [{ vesselId: t8, lotId: pn3Lot, drawL: 1000, deplete: true }],
  });

  const cTwice = await composition(t5);
  assert((await vesselVolume(t5)) === 7995, "the resident grew again to 7995 L");
  assert(shareOf(cTwice, syrah) === 6370, "Syrah is unchanged by the second absorb");
  assert(shareOf(cTwice, cab) === 625, "the FIRST absorb's Cabernet survives the second absorb");
  assert(shareOf(cTwice, pinot) === 1000, "the second absorb's Pinot is attributed too");
  assert(r2(cTwice.reduce((a, c) => a + c.volumeL, 0)) === 7995, "composition still sums to the vessel volume");

  const allEdges = await prisma.lotLineage.findMany({ where: { childLotId: syLot } });
  const fracSum = allEdges.reduce((a, e) => a + Number(e.fraction ?? 0), 0);
  assert(fracSum < 1, `parent fractions sum to less than 1, leaving the resident's own share (${fracSum.toFixed(4)})`);
  const csEdge = allEdges.find((e) => e.parentLotId === cs2Lot)!;
  assert(
    Math.abs(Number(csEdge.fraction) - 625 / 7995) < 1e-3,
    `the first parent was DILUTED by the second absorb (${Number(csEdge.fraction).toFixed(5)} ≈ 0.07817)`,
  );

  // ── 7. Revert then re-apply — composition must survive the round trip ───────
  // The reversal is where the in-op attribution first went wrong: returning wine keeps its OWN
  // identity, but a CORRECTION also "consumes" the lot it is coming back out of, so the naive
  // rule credited the returning Cabernet to Syrah. Reverting and re-applying a collapse then
  // silently lost it. This is that exact round trip.
  console.log("\n7. Revert and re-apply an absorb");
  const t9 = await makeVessel("QA-VC-T9", 4000);
  const t10 = await makeVessel("QA-VC-T10", 2000);
  await seedLot("QA-VC-SY2", t9, 2000, { varietyId: syrah, vineyardId: vyA, vintage: 2026 });
  await seedLot("QA-VC-CS3", t10, 500, { varietyId: cab, vineyardId: vyB, vintage: 2026 });
  const sy2Lot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-SY2" } })).id;
  const cs3Lot = (await prisma.lot.findFirstOrThrow({ where: { code: "QA-VC-CS3" } })).id;

  const grown = await blendLotsCore(ACTOR, {
    mode: "GROW_EXISTING",
    toVesselId: t9,
    components: [{ vesselId: t10, lotId: cs3Lot, drawL: 500, deplete: true }],
  });
  const cBefore = await composition(t9);
  assert(shareOf(cBefore, cab) === 500, "absorb attributed 500 L Cabernet");

  const { correctBlendCore } = await import("@/lib/blend/blend-correct");
  await correctBlendCore(ACTOR, { operationId: grown.operationId });
  const cReverted = await composition(t9);
  assert((await vesselVolume(t9)) === 2000, "revert put the vessel back to 2000 L");
  assert(shareOf(cReverted, syrah) === 2000, "revert leaves the resident's own Syrah intact");
  assert(shareOf(cReverted, cab) === 0, "revert removed the Cabernet from the destination");
  const cs3Back = await composition(t10);
  assert(shareOf(cs3Back, cab) === 500, "the returned wine is CABERNET again, not the lot it came out of");

  await blendLotsCore(ACTOR, {
    mode: "GROW_EXISTING",
    toVesselId: t9,
    components: [{ vesselId: t10, lotId: cs3Lot, drawL: 500, deplete: true }],
  });
  const cRedone = await composition(t9);
  assert(shareOf(cRedone, syrah) === 2000, "re-apply keeps Syrah at 2000 L");
  assert(shareOf(cRedone, cab) === 500, "re-apply restores the Cabernet — the round trip loses nothing");
  assert(r2(cRedone.reduce((a, c) => a + c.volumeL, 0)) === 2500, "composition still sums to the vessel volume");

  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

runAsTenant(TENANT, async () => {
  await scrub(); // clear leftovers from an interrupted prior run
  await main().then(scrub, async (e) => {
    await scrub();
    throw e;
  });
})
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("\nFAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
