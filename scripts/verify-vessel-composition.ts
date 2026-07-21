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
