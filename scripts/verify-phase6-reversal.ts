/**
 * Phase 6A reversal verification.
 *
 * Uses Demo Winery only. Covers the new correction surface for ADJUST/DEPLETE and the
 * fail-closed SEED policy without expanding the older Bhutan-targeted reversal scripts.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { reverseOperationCore, reversibilityForOperation } from "@/lib/ledger/reverse";
import { correctOperationCore } from "@/lib/cellar/correct";
import type { LedgerLine } from "@/lib/ledger/math";

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null, actorEmail: "system@verify-phase6-reversal" };
const stamp = Date.now().toString(36);
const prefix = `ZZ-P6R-${stamp}`;
let passed = 0;

const created = {
  lotIds: [] as string[],
  vesselIds: [] as string[],
  operationIds: [] as number[],
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

async function assertThrows(fn: () => Promise<unknown>, msg: string) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, msg);
}

async function makeVessel(code: string, capacityL = 1000): Promise<string> {
  const vessel = await prisma.vessel.create({ data: { code, type: "TANK", capacityL } });
  created.vesselIds.push(vessel.id);
  return vessel.id;
}

async function makeLot(code: string): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, status: "ACTIVE", form: "WINE", vintageYear: 2026 } });
  created.lotIds.push(lot.id);
  return lot.id;
}

async function writeOp(input: Parameters<typeof writeLotOperation>[1]): Promise<number> {
  const id = await runLedgerWrite((tx) => writeLotOperation(tx, input));
  created.operationIds.push(id);
  return id;
}

async function seedLot(code: string, vesselId: string, volumeL: number, marker = false): Promise<{ lotId: string; operationId: number }> {
  const lotId = await makeLot(code);
  const operationId = await writeOp({
    type: "SEED",
    lines: [
      { lotId, vesselId, deltaL: volumeL },
      { lotId, vesselId: null, deltaL: -volumeL, reason: "seed" },
    ] as LedgerLine[],
    actorUserId: ACTOR.actorUserId,
    enteredBy: ACTOR.actorEmail,
    metadata: marker ? { seedKind: "MANUAL_OPERATOR_SEED" } : undefined,
    lotCodes: new Map([[lotId, code]]),
    vesselCodes: new Map([[vesselId, vesselId]]),
    capacityByVessel: new Map([[vesselId, 1000]]),
  });
  return { lotId, operationId };
}

async function vesselVolume(lotId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { lotId }, select: { volumeL: true } });
  return rows.reduce((sum, row) => sum + Number(row.volumeL), 0);
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
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await prisma.$queryRaw`SELECT 1`;

    console.log("\n1. ADJUST reverses through append-only correction");
    const tankA = await makeVessel(`${prefix}-A`);
    const { lotId: lotA } = await seedLot(`${prefix}-A`, tankA, 100);
    const adjust = await writeOp({
      type: "ADJUST",
      lines: [
        { lotId: lotA, vesselId: tankA, deltaL: 20 },
        { lotId: lotA, vesselId: null, deltaL: -20, reason: "adjust" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotA, `${prefix}-A`]]),
      vesselCodes: new Map([[tankA, tankA]]),
      capacityByVessel: new Map([[tankA, 1000]]),
    });
    assert((await reversibilityForOperation(adjust)).reversible === true, "ADJUST has a DB-aware reversible verdict");
    assert((await vesselVolume(lotA)) === 120, "ADJUST increased the vessel projection");
    const reversedAdjust = await reverseOperationCore(ACTOR, { operationId: adjust });
    assert(reversedAdjust.correctionId != null, "ADJUST reversal wrote a correction operation");
    assert((await vesselVolume(lotA)) === 100, "ADJUST reversal restored the prior projection");

    console.log("\n2. DEPLETE reverses and reopens lifecycle");
    const tankB = await makeVessel(`${prefix}-B`);
    const { lotId: lotB } = await seedLot(`${prefix}-B`, tankB, 50);
    const deplete = await writeOp({
      type: "DEPLETE",
      lines: [
        { lotId: lotB, vesselId: tankB, deltaL: -50 },
        { lotId: lotB, vesselId: null, deltaL: 50, reason: "deplete" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lotB, `${prefix}-B`]]),
      vesselCodes: new Map([[tankB, tankB]]),
      capacityByVessel: new Map([[tankB, 1000]]),
    });
    assert((await statusOf(lotB)) === "DEPLETED", "DEPLETE drove the lot to DEPLETED");
    assert((await reversibilityForOperation(deplete)).reversible === true, "DEPLETE has a DB-aware reversible verdict");
    const reversedDeplete = await reverseOperationCore(ACTOR, { operationId: deplete });
    assert(reversedDeplete.correctionId != null, "DEPLETE reversal wrote a correction operation");
    assert((await vesselVolume(lotB)) === 50, "DEPLETE reversal restored the depleted volume");
    assert((await statusOf(lotB)) === "ACTIVE", "DEPLETE reversal reopened the lot through lifecycle sync");

    console.log("\n3. SEED policy is fail-closed unless explicitly manual");
    const tankC = await makeVessel(`${prefix}-C`);
    const unmarked = await seedLot(`${prefix}-C1`, tankC, 10);
    const unmarkedVerdict = await reversibilityForOperation(unmarked.operationId);
    assert(unmarkedVerdict.reversible === false, "unmarked SEED remains non-reversible");
    const marked = await seedLot(`${prefix}-C2`, tankC, 10, true);
    const markedVerdict = await reversibilityForOperation(marked.operationId);
    assert(markedVerdict.reversible === true, "explicit manual operator SEED can be reversible when fresh");
    await assertThrows(
      () => correctOperationCore(ACTOR, { operationId: marked.operationId }),
      "direct correction path refuses SEED even when the universal reverser would allow it",
    );
  });
}

main()
  .then(async () => {
    await runAsTenant(TENANT, cleanup);
    console.log(`\nALL PHASE 6 REVERSAL CHECKS PASSED (${passed} assertions)`);
  })
  .catch(async (e) => {
    await runAsTenant(TENANT, cleanup).catch(() => {});
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
