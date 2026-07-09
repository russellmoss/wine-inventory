/**
 * Phase 5 lifecycle verification.
 *
 * Uses Demo Winery only. Drives the real ledger chokepoint so Lot.status follows the
 * folded vessel_lot + bottled_lot_state projections without mutating ledger truth.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { archiveLotTx, syncLotLifecycleStatusTx, unarchiveLotTx } from "@/lib/lot/lifecycle";
import { LINEAGE_KINDS } from "@/lib/lot/lineage";
import type { LedgerLine } from "@/lib/ledger/math";

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null, actorEmail: "system@verify-lifecycle" };
const stamp = Date.now().toString(36);
const prefix = `ZZ-LC-${stamp}`;
let passed = 0;

const created = {
  lotIds: [] as string[],
  vesselIds: [] as string[],
  vineyardIds: [] as string[],
  locationIds: [] as string[],
  operationIds: [] as number[],
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

async function assertThrows(fn: () => Promise<unknown>, msg: string): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    passed++;
    console.log(`  ok - ${msg} (${text})`);
    return text;
  }
  throw new Error(`ASSERT FAILED: expected throw - ${msg}`);
}

async function makeVessel(code: string, capacityL = 1000): Promise<string> {
  const vessel = await prisma.vessel.create({ data: { code, type: "TANK", capacityL } });
  created.vesselIds.push(vessel.id);
  return vessel.id;
}

async function makeLot(code: string, status = "ACTIVE"): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, status, form: "WINE", vintageYear: 2026 } });
  created.lotIds.push(lot.id);
  return lot.id;
}

async function writeOp(input: Parameters<typeof writeLotOperation>[1]): Promise<number> {
  const id = await runLedgerWrite((tx) => writeLotOperation(tx, input));
  created.operationIds.push(id);
  return id;
}

async function seedLot(code: string, vesselId: string, volumeL: number): Promise<string> {
  const lotId = await makeLot(code);
  await writeOp({
    type: "SEED",
    lines: [
      { lotId, vesselId, deltaL: volumeL },
      { lotId, vesselId: null, deltaL: -volumeL, reason: "seed" },
    ] as LedgerLine[],
    actorUserId: ACTOR.actorUserId,
    enteredBy: ACTOR.actorEmail,
    lotCodes: new Map([[lotId, code]]),
    vesselCodes: new Map([[vesselId, vesselId]]),
    capacityByVessel: new Map([[vesselId, 1000]]),
  });
  return lotId;
}

async function statusOf(lotId: string): Promise<string> {
  return (await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, select: { status: true } })).status;
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
  await prisma.lotOperation.updateMany({ where: { enteredBy: ACTOR.actorEmail }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } }).catch(() => {});
  await prisma.bottledLotState.deleteMany({ where: { lotId: { in: created.lotIds } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: created.lotIds } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: created.lotIds } }, { childLotId: { in: created.lotIds } }] } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: created.lotIds } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: created.lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: created.vesselIds } } }).catch(() => {});
  await prisma.location.deleteMany({ where: { id: { in: created.locationIds } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { id: { in: created.vineyardIds } } }).catch(() => {});
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await prisma.$queryRaw`SELECT 1`;

    const loc = await prisma.location.create({ data: { name: `${prefix} bottle bin` } });
    created.locationIds.push(loc.id);

    console.log("\n1. Bulk lot depletes and reopens through correction");
    const tankA = await makeVessel(`${prefix}-A`);
    const lotA = await seedLot(`${prefix}-A`, tankA, 100);
    assert((await statusOf(lotA)) === "ACTIVE", "seeded bulk lot starts ACTIVE");
    const drainA = await writeOp({
      type: "LOSS",
      lines: [
        { lotId: lotA, vesselId: tankA, deltaL: -100 },
        { lotId: lotA, vesselId: null, deltaL: 100, reason: "loss" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotA, `${prefix}-A`]]),
      vesselCodes: new Map([[tankA, tankA]]),
      capacityByVessel: new Map([[tankA, 1000]]),
    });
    assert((await statusOf(lotA)) === "DEPLETED", "bulk drawdown to zero marks DEPLETED");
    await writeOp({
      type: "CORRECTION",
      correctsOperationId: drainA,
      lines: [
        { lotId: lotA, vesselId: tankA, deltaL: 100 },
        { lotId: lotA, vesselId: null, deltaL: -100, reason: "loss" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotA, `${prefix}-A`]]),
      vesselCodes: new Map([[tankA, tankA]]),
      capacityByVessel: new Map([[tankA, 1000]]),
    });
    assert((await statusOf(lotA)) === "ACTIVE", "correction that restores holdings marks ACTIVE");

    console.log("\n2. Bottle-storage holdings keep a vessel-zero lot live");
    const tankB = await makeVessel(`${prefix}-B`);
    const lotB = await seedLot(`${prefix}-B`, tankB, 90);
    await writeOp({
      type: "TIRAGE",
      lines: [
        { lotId: lotB, vesselId: tankB, deltaL: -90 },
        { lotId: lotB, vesselId: null, deltaL: 90, bucket: "BOTTLE_STORAGE", bottleDelta: 120 },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotB, `${prefix}-B`]]),
      vesselCodes: new Map([[tankB, tankB]]),
      capacityByVessel: new Map([[tankB, 1000]]),
      bottleState: { nominalFillMl: 750, method: "TRADITIONAL", tirageAt: new Date(), locationId: loc.id },
    });
    assert((await prisma.vesselLot.count({ where: { lotId: lotB } })) === 0, "tirage drains the vessel projection");
    assert((await statusOf(lotB)) === "ACTIVE", "bottle-storage projection keeps the lot ACTIVE");
    await writeOp({
      type: "FINISH",
      lines: [
        { lotId: lotB, vesselId: null, deltaL: -90, bucket: "BOTTLE_STORAGE", bottleDelta: -120 },
        { lotId: lotB, vesselId: null, deltaL: 90, reason: "bottle" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotB, `${prefix}-B`]]),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
    });
    assert((await statusOf(lotB)) === "DEPLETED", "draining bottle storage with no vessel holdings marks DEPLETED");

    console.log("\n3. Archive/unarchive guardrails");
    const tankC = await makeVessel(`${prefix}-C`);
    const lotC = await seedLot(`${prefix}-C`, tankC, 50);
    await runLedgerWrite((tx) => assertThrows(() => archiveLotTx(tx, ACTOR, { lotId: lotC }), "archive rejects while live holdings exist"));
    const drainC = await writeOp({
      type: "LOSS",
      lines: [
        { lotId: lotC, vesselId: tankC, deltaL: -50 },
        { lotId: lotC, vesselId: null, deltaL: 50, reason: "loss" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotC, `${prefix}-C`]]),
      vesselCodes: new Map([[tankC, tankC]]),
      capacityByVessel: new Map([[tankC, 1000]]),
    });
    await runLedgerWrite((tx) => archiveLotTx(tx, ACTOR, { lotId: lotC, reason: "verify zero balance" }));
    assert((await statusOf(lotC)) === "ARCHIVED", "archive succeeds once zero-balance");
    await assertThrows(
      () =>
        writeOp({
          type: "SEED",
          lines: [
            { lotId: lotC, vesselId: tankC, deltaL: 10 },
            { lotId: lotC, vesselId: null, deltaL: -10, reason: "seed" },
          ] as LedgerLine[],
          actorUserId: ACTOR.actorUserId,
          enteredBy: ACTOR.actorEmail,
          lotCodes: new Map([[lotC, `${prefix}-C`]]),
          vesselCodes: new Map([[tankC, tankC]]),
          capacityByVessel: new Map([[tankC, 1000]]),
        }),
      "normal write to archived lot rejects",
    );
    await runLedgerWrite((tx) => unarchiveLotTx(tx, ACTOR, { lotId: lotC }));
    assert((await statusOf(lotC)) === "DEPLETED", "unarchive zero-balance lot returns DEPLETED");
    await runLedgerWrite((tx) => archiveLotTx(tx, ACTOR, { lotId: lotC }));
    await writeOp({
      type: "CORRECTION",
      correctsOperationId: drainC,
      lines: [
        { lotId: lotC, vesselId: tankC, deltaL: 50 },
        { lotId: lotC, vesselId: null, deltaL: -50, reason: "loss" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotC, `${prefix}-C`]]),
      vesselCodes: new Map([[tankC, tankC]]),
      capacityByVessel: new Map([[tankC, 1000]]),
    });
    assert((await statusOf(lotC)) === "ACTIVE", "allowed correction can reopen archived lot to ACTIVE");

    console.log("\n4. CORRECTED skip and lineage vocabulary");
    const correctedLot = await makeLot(`${prefix}-CORRECTED`, "CORRECTED");
    await runLedgerWrite((tx) => syncLotLifecycleStatusTx(tx, { lotIds: [correctedLot], actor: ACTOR, allowArchivedReopen: true }));
    assert((await statusOf(correctedLot)) === "CORRECTED", "CORRECTED status is not overwritten by lifecycle sync");
    assert(!LINEAGE_KINDS.includes("TRANSFORM" as never), "lineage vocabulary excludes stale TRANSFORM");
    const unexpectedTransform = await prisma.lotLineage.count({ where: { kind: "TRANSFORM" } });
    assert(unexpectedTransform === 0, "current tenant has no TRANSFORM lineage edges");
  });
}

main()
  .then(async () => {
    await runAsTenant(TENANT, cleanup);
    console.log(`\nALL LIFECYCLE CHECKS PASSED (${passed} assertions)`);
  })
  .catch(async (e) => {
    await runAsTenant(TENANT, cleanup).catch(() => {});
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
