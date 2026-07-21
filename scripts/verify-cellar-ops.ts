/**
 * Phase 3 cellar-operations end-to-end verification against the live DB.
 *
 * Builds isolated ZZ-TEST-* fixtures (vessels + seeded lots), drives the real op CORES
 * (no UI) with an explicit actor, and asserts: addition is volume-neutral with correct
 * math + a treatment row; fining/cap likewise; filtration + loss drop volume; topping
 * moves keg→target and appends lineage; a group apply writes N ops sharing a batchId and
 * skips an empty member; corrections revert volumetric / void neutral, with the D15 guard
 * blocking an undo that a later op shadowed. EVERYTHING created is scrubbed in a finally
 * block so the user's data stays pristine (mirrors the Phase 1 cutover verification).
 *
 * Run:  npx tsx --env-file=.env scripts/verify-cellar-ops.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { foldLines, balanceKey, type LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { addAdditionCore, addFiningCore } from "@/lib/cellar/addition";
import { capManagementCore, filterVesselCore } from "@/lib/cellar/treatments";
import { recordLossCore } from "@/lib/cellar/loss";
import { topVesselCore } from "@/lib/cellar/topping";
import { applyToGroup } from "@/lib/cellar/group-apply";
import { correctOperationCore, correctBatchCore } from "@/lib/cellar/correct";
import { deleteNeutralOperationCore, editNeutralOperationCore } from "@/lib/cellar/edit";
import { normalizeMaterialKey } from "@/lib/cellar/material-normalize";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-cellar" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function vol(vesselId: string, lotId: string): Promise<number> {
  const row = await prisma.vesselLot.findFirst({ where: { vesselId, lotId } });
  return row ? r2(Number(row.volumeL)) : 0;
}
async function vesselTotal(vesselId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId } });
  return r2(rows.reduce((a, r) => a + Number(r.volumeL), 0));
}
/** The lots currently resident in a vessel (LEDGER-12: this must never exceed one). */
async function residents(vesselId: string): Promise<string[]> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId }, select: { lotId: true } });
  return rows.map((r) => r.lotId);
}

// ── fixtures ──
const createdVesselIds: string[] = [];
const createdLotIds: string[] = [];

async function makeVessel(code: string, type: "TANK" | "BARREL", capacityL: number): Promise<string> {
  const v = await prisma.vessel.create({ data: { code, type, capacityL } });
  createdVesselIds.push(v.id);
  return v.id;
}
async function seedLot(code: string, vesselId: string, volumeL: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE" } });
  createdLotIds.push(lot.id);
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
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
      note: "verify-cellar seed",
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map([[vesselId, vessel.code]]),
      capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function projectionMatchesFold(): Promise<boolean> {
  const ops = await prisma.lotOperation.findMany({ orderBy: { id: "asc" }, include: { lines: true } });
  const all: LedgerLine[] = ops.flatMap((op) =>
    op.lines.map((l) => ({ lotId: l.lotId, vesselId: l.vesselId, deltaL: Number(l.deltaL) })),
  );
  const folded = foldLines([], all);
  const proj = await prisma.vesselLot.findMany();
  const f = new Map(folded.map((b) => [balanceKey(b.vesselId, b.lotId), r2(b.volumeL)]));
  const p = new Map(proj.map((r) => [balanceKey(r.vesselId, r.lotId), r2(Number(r.volumeL))]));
  if (f.size !== p.size) return false;
  for (const [k, v] of f) if (p.get(k) !== v) return false;
  return true;
}

async function scrub() {
  console.log("\n── scrubbing test data ──");
  // Cost artifacts FIRST: cost_line/supply_consumption/operation_cost_transfer hold a composite
  // FK to lot_operation, and an ADDITION or FINING here books one. Deleting the ops first raises
  // P2003, which left the fixtures behind AND made the NEXT run fail in its opening scrub — the
  // script could not recover from its own interrupted run. Child → parent, like verify-blends.
  const ownOps = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const ownOpIds = ownOps.map((o) => o.id);
  if (ownOpIds.length > 0) {
    await prisma.costLine.deleteMany({ where: { operationId: { in: ownOpIds } } }).catch(() => {});
    await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: ownOpIds } } }).catch(() => {});
    await prisma.operationCostTransfer.deleteMany({ where: { operationId: { in: ownOpIds } } }).catch(() => {});
  }
  // Ops (cascades lines + treatments), found by the verify actor email.
  const delOps = await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: createdLotIds } } });
  await prisma.lotLineage.deleteMany({
    where: { OR: [{ parentLotId: { in: createdLotIds } }, { childLotId: { in: createdLotIds } }] },
  });
  // The group test uses an ad-hoc vessel selection (no saved VesselGroup), so there's no
  // group row to remove. Deleting the vessels cascades vessel_lot + any group memberships.
  // BY PATTERN, not just the in-process arrays: a crashed run has no arrays to clean up, so the
  // fixtures orphaned forever and the next run died on the unique vessel code (verify-blends
  // already scrubs this way).
  const orphanLots = await prisma.lot.findMany({ where: { code: { startsWith: "ZZTEST-" } }, select: { id: true } });
  const orphanVessels = await prisma.vessel.findMany({ where: { code: { startsWith: "ZZ-TEST-" } }, select: { id: true } });
  const allLotIds = [...new Set([...createdLotIds, ...orphanLots.map((l) => l.id)])];
  const allVesselIds = [...new Set([...createdVesselIds, ...orphanVessels.map((v) => v.id)])];
  await prisma.lotLineage.deleteMany({
    where: { OR: [{ parentLotId: { in: allLotIds } }, { childLotId: { in: allLotIds } }] },
  }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { OR: [{ lotId: { in: allLotIds } }, { vesselId: { in: allVesselIds } }] } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: allVesselIds } } });
  await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } });
  await prisma.cellarMaterial.deleteMany({ where: { normalizedKey: normalizeMaterialKey("ZZTEST KMBS") } });
  await prisma.cellarMaterial.deleteMany({ where: { normalizedKey: normalizeMaterialKey("ZZTEST BENTONITE") } });
  const delAudit = await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  console.log(`  removed ${delOps.count} ops, ${createdVesselIds.length} vessels, ${createdLotIds.length} lots, ${delAudit.count} audit rows`);
}

async function main() {
  console.log("── building fixtures ──");
  const tank = await makeVessel("ZZ-TEST-TANK", "TANK", 1000);
  const keg = await makeVessel("ZZ-TEST-KEG", "BARREL", 100);
  const b1 = await makeVessel("ZZ-TEST-B1", "BARREL", 250);
  const b2 = await makeVessel("ZZ-TEST-B2", "BARREL", 250);
  const b3 = await makeVessel("ZZ-TEST-B3", "BARREL", 250); // left empty → group skip
  await seedLot("ZZTEST-TANK", tank, 450);
  const lotKeg = await seedLot("ZZTEST-KEG", keg, 50);
  const lotB1 = await seedLot("ZZTEST-B1", b1, 200);
  await seedLot("ZZTEST-B2", b2, 200);
  console.log("  seeded TANK=450, KEG=50, B1=200, B2=200, B3=empty");
  assert(await projectionMatchesFold(), "projection == fold after seeding");

  // 1) ADDITION — neutral, math correct, treatment written, projection unchanged
  console.log("\n── 1. ADDITION (40 ppm) ──");
  const add = await addAdditionCore(ACTOR, { vesselId: tank, materialName: "ZZTEST KMBS", materialKind: "SO2", rateValue: 40, rateBasis: "MG_L" });
  assert((await vesselTotal(tank)) === 450, "TANK volume unchanged by the addition (neutral)");
  assert(add.computedTotal === 18 && add.computedUnit === "g", `40 ppm × 450 L = 18 g (got ${add.computedTotal} ${add.computedUnit})`);
  const addOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: add.operationId }, include: { lines: true, treatments: true } });
  assert(addOp.lines.length === 0, "ADDITION op has NO volumetric lines");
  assert(addOp.treatments.length === 1 && Number(addOp.treatments[0].computedTotal) === 18, "one treatment row with computedTotal=18");
  assert(Number(addOp.treatments[0].volumeLAtAddition) === 450, "treatment snapshots volumeLAtAddition=450");
  assert(await projectionMatchesFold(), "projection == fold after addition");

  // 2) FINING — neutral, treatment
  console.log("\n── 2. FINING (50 g/hL) ──");
  const fine = await addFiningCore(ACTOR, { vesselId: tank, materialName: "ZZTEST BENTONITE", materialKind: "FINING", rateValue: 50, rateBasis: "G_HL" });
  assert((await vesselTotal(tank)) === 450, "TANK volume unchanged by fining");
  assert(fine.computedTotal === 225, `50 g/hL × 450 L = 225 g (got ${fine.computedTotal})`);

  // 3) CAP MANAGEMENT — neutral, minimal treatment
  console.log("\n── 3. CAP MANAGEMENT (pump-over 20 min) ──");
  const cap = await capManagementCore(ACTOR, { vesselId: tank, kind: "PUMPOVER", durationMin: 20 });
  const capOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: cap.operationId }, include: { lines: true, treatments: true } });
  assert(capOp.lines.length === 0 && capOp.treatments[0].kind === "PUMPOVER" && capOp.treatments[0].durationMin === 20, "CAP_MGMT: no lines, PUMPOVER treatment, 20 min");
  assert((await vesselTotal(tank)) === 450, "TANK volume unchanged by cap management");

  // 4) FILTRATION — volume drops, treatment with medium/micron
  console.log("\n── 4. FILTRATION (5 L loss) ──");
  const filt = await filterVesselCore(ACTOR, { vesselId: tank, lossL: 5, medium: "pad", micron: 0.45 });
  assert((await vesselTotal(tank)) === 445, `TANK 450 → 445 after 5 L filtration loss (got ${await vesselTotal(tank)})`);
  const filtOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: filt.operationId }, include: { lines: true, treatments: true } });
  assert(filtOp.lines.some((l) => l.reason === "filtration"), "filtration op carries an external 'filtration' loss line");
  assert(filtOp.treatments[0].medium === "pad" && Number(filtOp.treatments[0].micron) === 0.45, "filtration treatment records medium=pad, micron=0.45");
  assert(await projectionMatchesFold(), "projection == fold after filtration");

  // 5) DUMP — volume drops, dump reason (loss = deliberate disposal, not evaporation)
  console.log("\n── 5. DUMP (8 L discarded) ──");
  const loss = await recordLossCore(ACTOR, { vesselId: tank, lossL: 8 });
  assert((await vesselTotal(tank)) === 437, `TANK 445 → 437 after dumping 8 L (got ${await vesselTotal(tank)})`);
  const lossOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: loss.operationId }, include: { lines: true } });
  assert(lossOp.lines.some((l) => l.reason === "dump"), "dump op carries an external 'dump' line");

  // 6) TOPPING — keg → B1 + lineage
  console.log("\n── 6. TOPPING (10 L keg → B1) ──");
  const top = await topVesselCore(ACTOR, { toVesselId: b1, fromVesselId: keg, volumeL: 10 });
  // LEDGER-12 (plan 088): topping used to leave the keg lot sitting in B1 as a SECOND resident.
  // A vessel holds one cohesive liquid, so the topped-up wine now ABSORBS — B1 still holds only
  // its own lot, grown by 10 L, and the lineage edge below is what records where it came from.
  assert((await vol(b1, lotKeg)) === 0, "the keg lot does NOT become a second resident of B1");
  assert((await residents(b1)).length === 1, "B1 still holds exactly one lot after topping");
  assert((await vol(b1, lotB1)) === 210, "B1's own lot absorbed the top-up (200 → 210 L)");
  assert((await vol(keg, lotKeg)) === 40, "KEG dropped 50 → 40");
  assert((await vesselTotal(b1)) === 210, "B1 total 200 → 210");
  const edge = await prisma.lotLineage.findFirst({ where: { parentLotId: lotKeg, childLotId: lotB1 } });
  assert(!!edge && edge.kind === "TOPPING", "lineage edge keg-lot → B1-lot (kind TOPPING) appended");
  assert(top.lineageEdges === 1, "topping reported 1 lineage edge");
  assert(await projectionMatchesFold(), "projection == fold after topping");

  // 7) GROUP apply — ADDITION across [B1, B2, B3]; B3 empty → skipped
  console.log("\n── 7. GROUP apply (addition to B1+B2+B3) ──");
  const grp = await applyToGroup(ACTOR, { vesselIds: [b1, b2, b3] }, { op: "ADDITION", materialName: "ZZTEST KMBS", materialKind: "SO2", rateValue: 30, rateBasis: "G_HL" });
  assert(grp.applied === 2 && grp.skipped === 1, `2 applied, 1 skipped (got applied=${grp.applied}, skipped=${grp.skipped})`);
  const groupOps = await prisma.lotOperation.findMany({ where: { batchId: grp.batchId } });
  assert(groupOps.length === 2, "two ops written sharing the batchId");
  assert(groupOps.every((o) => o.batchId === grp.batchId), "every member op carries the shared batchId");
  assert(grp.outcomes.find((o) => o.vesselId === b3)?.status === "skipped", "empty B3 was skipped, not thrown");

  // 8) Correct NEUTRAL (void the addition)
  console.log("\n── 8. CORRECT neutral (void the addition) ──");
  const voided = await correctOperationCore(ACTOR, { operationId: add.operationId });
  assert(voided.kind === "voided", "addition correction is a void");
  const voidedT = await prisma.lotTreatment.findMany({ where: { operationId: add.operationId } });
  assert(voidedT.every((t) => t.voidedByOperationId === voided.correctionId), "the addition's treatment is marked voided");
  assert((await vesselTotal(tank)) === 437, "voiding a neutral op leaves volume unchanged");
  let doubleVoidBlocked = false;
  try {
    await correctOperationCore(ACTOR, { operationId: add.operationId });
  } catch {
    doubleVoidBlocked = true;
  }
  assert(doubleVoidBlocked, "double-correction of the same op is blocked");

  // 9) Correct VOLUMETRIC — revert LOSS succeeds; revert FILTRATION blocked (D15 downstream)
  console.log("\n── 9. CORRECT volumetric (D15 guard) ──");
  let filtBlocked = false;
  try {
    await correctOperationCore(ACTOR, { operationId: filt.operationId });
  } catch (e) {
    filtBlocked = true;
    console.log(`    (filtration revert correctly blocked: ${(e as Error).message.slice(0, 60)}…)`);
  }
  assert(filtBlocked, "reverting filtration is blocked — the later loss touched the same wine (D15)");
  const revLoss = await correctOperationCore(ACTOR, { operationId: loss.operationId });
  assert(revLoss.kind === "reverted", "loss correction is a volumetric revert");
  assert((await vesselTotal(tank)) === 445, `reverting the 8 L loss restores TANK 437 → 445 (got ${await vesselTotal(tank)})`);

  // 10) Revert TOPPING — moves the wine back, projection consistent
  console.log("\n── 10. REVERT topping ──");
  const revTop = await correctOperationCore(ACTOR, { operationId: top.operationId });
  assert(revTop.kind === "reverted", "topping correction is a volumetric revert");
  assert((await vol(keg, lotKeg)) === 50, "KEG restored to 50 L");
  assert((await vesselTotal(b1)) === 200, "B1 back to 200 L");

  // 11) Batch correction — void both group additions
  console.log("\n── 11. BATCH correct the group fan-out ──");
  const batch = await correctBatchCore(ACTOR, { batchId: grp.batchId });
  assert(batch.corrected === 2, `both group ops corrected (got ${batch.corrected})`);

  // 12) Timeline EDIT + DELETE of a neutral op (and reject deleting a volumetric op)
  console.log("\n── 12. EDIT + DELETE a neutral op ──");
  const tankNow = await vesselTotal(tank);
  const add2 = await addAdditionCore(ACTOR, { vesselId: tank, materialName: "ZZTEST KMBS", rateValue: 20, rateBasis: "MG_L" });
  await editNeutralOperationCore(ACTOR, { operationId: add2.operationId, rateValue: 50, rateBasis: "MG_L" });
  const editedT = await prisma.lotTreatment.findFirstOrThrow({ where: { operationId: add2.operationId } });
  assert(Number(editedT.rateValue) === 50, `edit updated the rate to 50 (got ${Number(editedT.rateValue)})`);
  assert(Number(editedT.computedTotal) === r2((50 * tankNow) / 1000), `edit recomputed the total from the volume snapshot (got ${Number(editedT.computedTotal)})`);
  await deleteNeutralOperationCore(ACTOR, { operationId: add2.operationId });
  assert((await prisma.lotOperation.findUnique({ where: { id: add2.operationId } })) === null, "neutral op hard-deleted off the timeline");
  assert((await prisma.lotTreatment.count({ where: { operationId: add2.operationId } })) === 0, "its treatment cascade-deleted with the op");
  assert(await projectionMatchesFold(), "projection == fold after edit + delete (neutral delete is volume-safe)");
  let volDeleteBlocked = false;
  try {
    await deleteNeutralOperationCore(ACTOR, { operationId: filt.operationId });
  } catch {
    volDeleteBlocked = true;
  }
  assert(volDeleteBlocked, "deleting a volume-changing op (filtration) is rejected — it must be reverted, not erased");

  assert(await projectionMatchesFold(), "projection == fold at the end of the run");
  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

runAsTenant("org_bhutan_wine_co", async () => {
  await scrub();
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
