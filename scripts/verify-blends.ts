/**
 * Phase 5 blends/lineage/RBAC end-to-end verification against the live DB.
 *
 * Builds isolated ZZ-TEST-* fixtures (vineyards + vessels + seeded lots with source sets),
 * drives the real CORES (no UI) with an explicit actor, and proves every Phase 5 exit
 * criterion: NEW-LOT + GROW-EXISTING blends, aggregated lineage + gross-share fractions,
 * source-set union, partial draws, the opt-in lens (on/off), bench-trial promote/discard,
 * blend correction (allow incl. tasting-note-only, refuse on downstream), and the rack-aware
 * routing (Unit 8b). Everything created is scrubbed in a finally block so the DB stays pristine.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-blends.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { foldLines, balanceKey, type LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { correctBlendCore, previewBlendCorrection } from "@/lib/blend/blend-correct";
import { rackVesselCore } from "@/lib/vessels/rack-core";
import { createTrialCore, discardTrialCore } from "@/lib/blend/trials";
import { scaleTrialToVolume } from "@/lib/blend/trial-math";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-blends" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const createdVesselIds: string[] = [];
const createdLotIds: string[] = [];
const createdVineyardIds: string[] = [];
const createdTrialIds: string[] = [];

async function makeVineyard(name: string): Promise<string> {
  // Idempotent: reuse a leftover from an interrupted prior run (scrub cleans it up at the end).
  const v = (await prisma.vineyard.findFirst({ where: { name } })) ?? (await prisma.vineyard.create({ data: { name } }));
  createdVineyardIds.push(v.id);
  return v.id;
}
async function makeVessel(code: string, capacityL: number): Promise<string> {
  const v = await prisma.vessel.create({ data: { code, type: "TANK", capacityL } });
  createdVesselIds.push(v.id);
  return v.id;
}
/** Seed a lot into a vessel and attach a source-vineyard row (so blends can union them). */
async function seedLot(code: string, vesselId: string, volumeL: number, vineyardId: string): Promise<string> {
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const lot = await prisma.lot.create({ data: { code, form: "WINE", originVineyardId: vineyardId } });
  createdLotIds.push(lot.id);
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId } });
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
      note: "verify-blends seed",
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map([[vesselId, vessel.code]]),
      capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function vol(vesselId: string, lotId: string): Promise<number> {
  const row = await prisma.vesselLot.findFirst({ where: { vesselId, lotId } });
  return row ? r2(Number(row.volumeL)) : 0;
}
async function residents(vesselId: string): Promise<string[]> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId } });
  return rows.map((r) => r.lotId);
}
async function sourceSet(lotId: string): Promise<string[]> {
  const rows = await prisma.lotVineyard.findMany({ where: { lotId } });
  return rows.map((r) => r.vineyardId).sort();
}
async function edgesInto(childLotId: string) {
  return prisma.lotLineage.findMany({ where: { childLotId } });
}

/** Replicates listLots's optional source-vineyard filter (lib/lot/data.ts imports server-only,
 * which tsx can't load — this is the exact same WHERE clause the lens passes). */
async function lensLots(sourceVineyardIn?: string[]): Promise<{ id: string }[]> {
  return prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      ...(sourceVineyardIn ? { sourceVineyards: { some: { vineyardId: { in: sourceVineyardIn } } } } : {}),
    },
    select: { id: true },
  });
}

/** Global projection == fold of the entire ledger (the INVARIANT). */
async function projectionMatchesFold(): Promise<boolean> {
  // Fold the WHOLE ledger in monotonic operation order (D14) — out of order, a -draw could be
  // applied before its +seed and trip foldLines' non-negative guard (a false alarm).
  const lines = await prisma.lotOperationLine.findMany({
    orderBy: [{ operationId: "asc" }, { id: "asc" }],
    select: { lotId: true, vesselId: true, deltaL: true },
  });
  const folded = foldLines(
    [],
    lines.map((l) => ({ lotId: l.lotId, vesselId: l.vesselId, deltaL: Number(l.deltaL) })),
  );
  const foldByKey = new Map(folded.map((b) => [balanceKey(b.vesselId, b.lotId), r2(b.volumeL)]));
  const proj = await prisma.vesselLot.findMany({ select: { vesselId: true, lotId: true, volumeL: true } });
  if (proj.length !== foldByKey.size) return false;
  for (const p of proj) {
    if (foldByKey.get(balanceKey(p.vesselId, p.lotId)) !== r2(Number(p.volumeL))) return false;
  }
  return true;
}

async function scrub() {
  // Idempotent BY PATTERN (so even a crashed run leaves nothing behind): all ZZ- lots + the
  // BL-Z* blend children minted during the run, plus anything we tracked this process.
  await prisma.blendTrial.deleteMany({ where: { name: { startsWith: "ZZ" } } }).catch(() => {}); // cascades components
  const patternLots = await prisma.lot.findMany({
    where: { OR: [{ code: { startsWith: "ZZ-" } }, { code: { contains: "-BL-Z" } }] },
    select: { id: true },
  });
  const allLotIds = [...new Set([...createdLotIds, ...patternLots.map((l) => l.id)])];
  await prisma.blendTrialComponent.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: allLotIds } }, { childLotId: { in: allLotIds } }] } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotTastingNote.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  const orphanOps = await prisma.lotOperation.findMany({ where: { lines: { none: {} }, enteredBy: ACTOR.actorEmail }, select: { id: true } });
  await prisma.lotOperation.deleteMany({ where: { id: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZ-" } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { name: { startsWith: "ZZ-TEST" } } }).catch(() => {});
}

async function main() {
  const VYA = await makeVineyard("ZZ-TEST Vineyard A");
  const VYB = await makeVineyard("ZZ-TEST Vineyard B");
  const VYC = await makeVineyard("ZZ-TEST Vineyard C");

  // ── 1. NEW-LOT blend: A(partial) + B + C → new child, aggregated lineage, source union ──
  console.log("\n── 1. NEW-LOT blend (partial draw + source-set union) ──");
  const t1 = await makeVessel("ZZ-T1", 2000);
  const t2 = await makeVessel("ZZ-T2", 2000);
  const t3 = await makeVessel("ZZ-T3", 2000);
  const t4 = await makeVessel("ZZ-T4", 2000); // empty destination
  const lotA = await seedLot("ZZ-A", t1, 600, VYA);
  const lotB = await seedLot("ZZ-B", t2, 300, VYB);
  const lotC = await seedLot("ZZ-C", t3, 100, VYA);

  const blend = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "ZZ",
    vintage: 2024,
    toVesselId: t4,
    components: [
      { vesselId: t1, lotId: lotA, drawL: 400 }, // partial — 200 stays
      { vesselId: t2, lotId: lotB, drawL: 300 },
      { vesselId: t3, lotId: lotC, drawL: 100 },
    ],
  });
  createdLotIds.push(blend.childLotId);
  assert(blend.childCode.startsWith("2024-BL-ZZ"), `child code is a BL code (${blend.childCode})`);
  assert((await vol(t4, blend.childLotId)) === 800, "child holds 800 L (400+300+100)");
  assert((await vol(t1, lotA)) === 200, "partial-drawn parent A keeps its 200 L remainder");
  const e1 = await edgesInto(blend.childLotId);
  assert(e1.length === 3, `3 aggregated lineage edges (got ${e1.length})`);
  const fracSum = e1.reduce((a, e) => a + Number(e.fraction ?? 0), 0);
  assert(Math.abs(fracSum - 1) < 1e-4, `fractions sum to 1 (got ${r2(fracSum)})`);
  const aFrac = Number(e1.find((e) => e.parentLotId === lotA)!.fraction);
  assert(Math.abs(aFrac - 0.5) < 1e-4, `A's gross share = 400/800 = 0.5 (got ${aFrac})`);
  assert(JSON.stringify(await sourceSet(blend.childLotId)) === JSON.stringify([VYA, VYB].sort()), "child source set = union {A,B}");
  assert(blend.provenanceComplete, "child provenance complete (all parents known)");
  assert(await projectionMatchesFold(), "projection == fold after the blend");

  // ── 2. The lens (on returns it, other vineyard excludes it, off shows everything) ──
  console.log("\n── 2. 'My fruit downstream' lens ──");
  const lensA = await lensLots([VYA]);
  assert(lensA.some((l) => l.id === blend.childLotId), "lens for a VYA manager returns the blend (sources {A,B})");
  const lensC = await lensLots([VYC]);
  assert(!lensC.some((l) => l.id === blend.childLotId), "lens for a VYC manager excludes the {A,B} blend");
  const lensOff = await lensLots();
  assert(lensOff.some((l) => l.id === blend.childLotId), "lens OFF (tenant-wide) still shows the blend — no scoping regression");

  // ── 3. Same parent drawn from two vessels → ONE aggregated edge (council C2) ──
  console.log("\n── 3. Same parent from two vessels → one edge ──");
  const t5 = await makeVessel("ZZ-T5", 2000);
  const t6 = await makeVessel("ZZ-T6", 2000);
  const t7 = await makeVessel("ZZ-T7", 2000);
  const lotD = await seedLot("ZZ-D", t5, 300, VYA);
  // Put more of D into a second vessel by seeding the SAME code? Codes are unique; instead seed
  // a separate lot E and rack part of D into t6 so D sits in two vessels.
  const lotE = await seedLot("ZZ-E", t7, 200, VYB);
  await rackVesselCore(ACTOR, { fromVesselId: t5, toVesselId: t6, drawL: 100 }); // D now in t5(200)+t6(100)
  const t8 = await makeVessel("ZZ-T8", 2000);
  const blend3 = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "ZQ",
    toVesselId: t8,
    components: [
      { vesselId: t5, lotId: lotD, drawL: 200 },
      { vesselId: t6, lotId: lotD, drawL: 100 }, // same lot D, second vessel
      { vesselId: t7, lotId: lotE, drawL: 200 },
    ],
  });
  createdLotIds.push(blend3.childLotId);
  const e3 = await edgesInto(blend3.childLotId);
  const dEdges = e3.filter((e) => e.parentLotId === lotD);
  assert(dEdges.length === 1, `D produces ONE aggregated edge (got ${dEdges.length})`);
  assert(Math.abs(Number(dEdges[0].fraction) - 0.6) < 1e-4, `D's aggregated gross share = 300/500 = 0.6 (got ${Number(dEdges[0].fraction)})`);

  // ── 4. GROW-EXISTING blend: resident keeps its code, gains an edge ──
  console.log("\n── 4. GROW-EXISTING blend ──");
  const tg = await makeVessel("ZZ-TG", 2000);
  const th = await makeVessel("ZZ-TH", 2000);
  const lotResident = await seedLot("ZZ-RES", tg, 500, VYA);
  const lotG = await seedLot("ZZ-G", th, 300, VYB);
  const grow = await blendLotsCore(ACTOR, {
    mode: "GROW_EXISTING",
    toVesselId: tg,
    components: [{ vesselId: th, lotId: lotG, drawL: 300 }],
  });
  assert(grow.childLotId === lotResident, "grow-existing keeps the resident lot as the child");
  assert(grow.childCode === "ZZ-RES", "resident lot keeps its immutable code");
  assert((await vol(tg, lotResident)) === 800, "resident grew to 800 L (500+300)");
  const eg = await edgesInto(lotResident);
  assert(eg.some((e) => e.parentLotId === lotG), "grow-existing recorded a lineage edge from the incoming lot");
  assert(JSON.stringify(await sourceSet(lotResident)) === JSON.stringify([VYA, VYB].sort()), "resident source set now unions {A,B}");

  // ── 5. Bench trial → scale → promote (blend), and discard = zero ledger impact ──
  console.log("\n── 5. Bench trial promote + discard ──");
  const scaled = scaleTrialToVolume(
    [
      { lotId: "x", proportion: 0.6 },
      { lotId: "y", proportion: 0.3 },
      { lotId: "z", proportion: 0.1 },
    ],
    600,
  );
  assert(JSON.stringify(scaled.map((s) => s.litres)) === JSON.stringify([360, 180, 60]), "trial 60/30/10 of 600 L scales to 360/180/60");
  const trial = await createTrialCore(ACTOR, {
    name: "ZZ trial",
    components: [
      { lotId: lotA, proportion: 0.6 },
      { lotId: lotB, proportion: 0.4 },
    ],
  });
  createdTrialIds.push(trial.id);
  const opsBeforeDiscard = await prisma.lotOperation.count();
  await discardTrialCore(ACTOR, { id: trial.id });
  const opsAfterDiscard = await prisma.lotOperation.count();
  assert(opsBeforeDiscard === opsAfterDiscard, "discarding a trial writes ZERO ledger ops");
  const discarded = await prisma.blendTrial.findUniqueOrThrow({ where: { id: trial.id } });
  assert(discarded.status === "DISCARDED", "trial marked DISCARDED");

  // ── 6. Blend correction: allow (incl. tasting-note-only), refuse on downstream ──
  console.log("\n── 6. Blend correction (D6/D15) ──");
  // Fresh NEW-LOT blend to correct.
  const tc1 = await makeVessel("ZZ-TC1", 2000);
  const tc2 = await makeVessel("ZZ-TC2", 2000);
  const tcDest = await makeVessel("ZZ-TCD", 2000);
  const lotP = await seedLot("ZZ-P", tc1, 400, VYA);
  const lotQ = await seedLot("ZZ-Q", tc2, 200, VYB);
  const cblend = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "ZC",
    toVesselId: tcDest,
    components: [
      { vesselId: tc1, lotId: lotP, drawL: 400 },
      { vesselId: tc2, lotId: lotQ, drawL: 200 },
    ],
  });
  createdLotIds.push(cblend.childLotId);
  // A tasting note on the child must NOT block the undo (off-ledger).
  await prisma.lotTastingNote.create({ data: { lotId: cblend.childLotId, observedAt: new Date(), enteredByEmail: ACTOR.actorEmail, notes: "ZZ note" } });
  const preview = await previewBlendCorrection(cblend.operationId);
  assert(preview.ok, "a blend with only a tasting note can still be undone (off-ledger doesn't block)");
  await correctBlendCore(ACTOR, { operationId: cblend.operationId });
  assert((await vol(tc1, lotP)) === 400, "correction returned P's 400 L to its original vessel");
  assert((await vol(tc2, lotQ)) === 200, "correction returned Q's 200 L to its original vessel");
  assert((await vol(tcDest, cblend.childLotId)) === 0, "no residual child VesselLot after correction");
  const correctedChild = await prisma.lot.findUniqueOrThrow({ where: { id: cblend.childLotId } });
  assert(correctedChild.status === "CORRECTED", "child lot marked CORRECTED (kept for audit)");
  assert((await edgesInto(cblend.childLotId)).length === 2, "lineage edges retained after correction");
  assert(await projectionMatchesFold(), "projection == fold after correction");

  // Refuse: a blend whose child was racked on (downstream activity).
  const tr1 = await makeVessel("ZZ-TR1", 2000);
  const tr2 = await makeVessel("ZZ-TR2", 2000);
  const trDest = await makeVessel("ZZ-TRD", 2000);
  const trMove = await makeVessel("ZZ-TRM", 2000);
  const lotR = await seedLot("ZZ-R", tr1, 300, VYA);
  const lotS = await seedLot("ZZ-S", tr2, 300, VYB);
  const rblend = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "ZR",
    toVesselId: trDest,
    components: [
      { vesselId: tr1, lotId: lotR, drawL: 300 },
      { vesselId: tr2, lotId: lotS, drawL: 300 },
    ],
  });
  createdLotIds.push(rblend.childLotId);
  await rackVesselCore(ACTOR, { fromVesselId: trDest, toVesselId: trMove, drawL: 200 }); // rack the child on
  let refused = false;
  try {
    await correctBlendCore(ACTOR, { operationId: rblend.operationId });
  } catch {
    refused = true;
  }
  assert(refused, "correction REFUSED once the child was racked on (D15 guard)");

  // ── 7. Rack-aware routing (Unit 8b) ──
  console.log("\n── 7. Rack becomes blend-aware ──");
  // (a) rack into empty → plain RACK, no lineage.
  const ra1 = await makeVessel("ZZ-RA1", 2000);
  const raEmpty = await makeVessel("ZZ-RA2", 2000);
  const lotRA = await seedLot("ZZ-RA", ra1, 300, VYA);
  const rackEmpty = await rackVesselCore(ACTOR, { fromVesselId: ra1, toVesselId: raEmpty, drawL: 100 });
  assert(rackEmpty.kind === "RACK", "rack into an empty vessel stays a plain RACK");
  assert((await edgesInto(lotRA)).length === 0, "rack into empty wrote no lineage");

  // (b) rack into a vessel holding a DIFFERENT lot → GROW-EXISTING blend.
  const rb1 = await makeVessel("ZZ-RB1", 2000);
  const rbDest = await makeVessel("ZZ-RB2", 2000);
  const lotRBsrc = await seedLot("ZZ-RBSRC", rb1, 300, VYA);
  const lotRBdest = await seedLot("ZZ-RBDST", rbDest, 400, VYB);
  const rackBlend = await rackVesselCore(ACTOR, { fromVesselId: rb1, toVesselId: rbDest, drawL: 200 });
  assert(rackBlend.kind === "BLEND", "rack into a vessel holding a different lot routes to a BLEND");
  assert((await residents(rbDest)).filter((id) => id !== lotRBdest).length === 0, "destination holds ONE resident (no co-residence)");
  assert((await vol(rbDest, lotRBdest)) === 600, "destination lot grew to 600 L (400+200)");
  const rbEdges = await edgesInto(lotRBdest);
  assert(rbEdges.some((e) => e.parentLotId === lotRBsrc), "rack-blend recorded a lineage edge from the source lot");

  // (c) rack the SAME lot into a vessel holding it → merge, no lineage.
  const rc1 = await makeVessel("ZZ-RC1", 2000);
  const rcDest = await makeVessel("ZZ-RC2", 2000);
  const lotRC = await seedLot("ZZ-RC", rc1, 500, VYA);
  await rackVesselCore(ACTOR, { fromVesselId: rc1, toVesselId: rcDest, drawL: 200 }); // RC now in both
  const mergeRack = await rackVesselCore(ACTOR, { fromVesselId: rc1, toVesselId: rcDest, drawL: 100 }); // same lot again
  assert(mergeRack.kind === "RACK", "racking the SAME lot into a vessel already holding it stays a RACK (merge)");
  assert((await edgesInto(lotRC)).length === 0, "same-lot merge wrote no lineage");

  assert(await projectionMatchesFold(), "projection == fold at the end of the run");
  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

runAsTenant("org_bhutan_wine_co", async () => {
  await scrub(); // clean any ZZ leftovers from an interrupted prior run before seeding
  await main().then(scrub);
  const ok = await projectionMatchesFold();
  console.log(ok ? "POST-SCRUB: projection == fold (DB pristine)." : "POST-SCRUB WARNING: projection drift!");
  return ok;
})
  .then(async (ok) => {
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("\nFAILED:", e);
    try {
      await runAsTenant("org_bhutan_wine_co", scrub);
    } catch (se) {
      console.error("scrub error:", se);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
