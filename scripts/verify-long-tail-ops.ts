/**
 * Phase 6E long-tail operation verifier.
 *
 * Uses Demo Winery only. Proves that DRAIN/CUSTOM route through existing
 * balanced ledger families, while DELESTAGE/COLD_STAB remain work-order/process
 * semantics instead of sticky OperationType enum values.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { OPERATION_TYPES } from "@/lib/ledger/vocabulary";
import { mapLineToForm } from "@/lib/compliance/form-map";
import { LONG_TAIL_DECISIONS, operationDisplayLabel, operationLongTailMarker } from "@/lib/cellar/long-tail-metadata";
import { recordLongTailOperationCore } from "@/lib/cellar/long-tail";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { SYSTEM_TEMPLATES } from "@/lib/work-orders/system-templates";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-long-tail-ops" };
const prefix = `ZZ-P6E-${Date.now().toString(36)}`;
let passed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

async function cleanup() {
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } }).catch(() => []);
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const lotIds = lots.map((l) => l.id);
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const vesselIds = vessels.map((v) => v.id);

  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
  await prisma.lotOperation.updateMany({ where: { id: { in: opIds } }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.costLine.deleteMany({ where: { OR: [{ operationId: { in: opIds } }, { lotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.operationCostTransfer.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: opIds } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { vesselId: { in: vesselIds } }] } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: vesselIds } } }).catch(() => {});
}

async function makeFixture(): Promise<{ vesselId: string; lotId: string }> {
  const vessel = await prisma.vessel.create({ data: { code: `${prefix}-T1`, type: "TANK", capacityL: 500 }, select: { id: true, code: true, capacityL: true } });
  const lot = await prisma.lot.create({ data: { code: `${prefix}-LOT`, form: "WINE" }, select: { id: true, code: true } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId: vessel.id, deltaL: 100 },
        { lotId: lot.id, vesselId: null, deltaL: -100, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      metadata: { seedKind: "MANUAL_OPERATOR_SEED" },
      lotCodes: new Map([[lot.id, lot.code]]),
      vesselCodes: new Map([[vessel.id, vessel.code]]),
      capacityByVessel: new Map([[vessel.id, Number(vessel.capacityL)]]),
    }),
  );
  return { vesselId: vessel.id, lotId: lot.id };
}

async function vesselTotal(vesselId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId }, select: { volumeL: true } });
  return Math.round(rows.reduce((sum, row) => sum + Number(row.volumeL), 0) * 100) / 100;
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await cleanup();
    try {
      console.log("\n1. Semantic-fit decisions avoid enum pollution");
      for (const value of ["DRAIN", "DELESTAGE", "COLD_STAB", "CUSTOM"]) {
        assert(!OPERATION_TYPES.includes(value as never), `${value} is not an OperationType enum value`);
      }
      assert(LONG_TAIL_DECISIONS.length === 4, "all four long-tail candidates have recorded decisions");
      assert(SYSTEM_TEMPLATES.some((t) => t.code === "SYS-DELESTAGE"), "delestage is covered by the rack-and-return work-order template");
      assert(SYSTEM_TEMPLATES.some((t) => t.code === "SYS-COLD-STAB"), "cold stabilization is covered by a process work-order template");

      console.log("\n2. DRAIN routes to existing LOSS");
      const fixture = await makeFixture();
      const drain = await recordLongTailOperationCore(ACTOR, { candidate: "DRAIN", drainIntent: "WASTE", vesselId: fixture.vesselId, volumeL: 12 });
      const drainOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: drain.operationId }, include: { lines: true } });
      assert(drainOp.type === "LOSS", "drain-to-waste records as LOSS");
      assert(operationDisplayLabel(drainOp.metadata) === "Drain to waste", "drain label is stored in operation metadata");
      assert(operationLongTailMarker(drainOp.metadata)?.candidate === "DRAIN", "drain metadata names the candidate");
      assert(drainOp.lines.some((l) => l.reason === "dump"), "drain uses the existing dump loss reason");
      assert((await vesselTotal(fixture.vesselId)) === 88, "drain reduced vessel volume by 12 L");
      const lossMap = mapLineToForm({ opType: "LOSS", reason: "dump", source: "BULK", deltaSign: -1, taxClass: "A_LE16", sparklingSub: null });
      assert(lossMap.target?.section === "A" && lossMap.target.line === 29, "drain inherits the existing bulk-loss compliance map");

      console.log("\n3. CUSTOM routes through a chosen balanced LOSS shape");
      const custom = await recordLongTailOperationCore(ACTOR, { candidate: "CUSTOM", shape: "LOSS", customLabel: "Bench trial discard", vesselId: fixture.vesselId, volumeL: 3 });
      const customOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: custom.operationId }, include: { lines: true } });
      assert(customOp.type === "LOSS", "custom v1 records the selected LOSS line shape");
      assert(operationDisplayLabel(customOp.metadata) === "Bench trial discard", "custom label is stored in metadata.customLabel via helper");
      assert(operationLongTailMarker(customOp.metadata)?.candidate === "CUSTOM", "custom metadata names the candidate");
      assert(customOp.lines.reduce((sum, line) => sum + Number(line.deltaL), 0) === 0, "custom routed operation remains balanced");
      assert((await vesselTotal(fixture.vesselId)) === 85, "custom loss reduced vessel volume by 3 L");

      console.log("\n4. Routed operations reverse through existing LOSS reversal");
      await reverseOperationCore(ACTOR, { operationId: custom.operationId });
      assert((await vesselTotal(fixture.vesselId)) === 88, "custom routed loss reversed through the existing reverser");
      await reverseOperationCore(ACTOR, { operationId: drain.operationId });
      assert((await vesselTotal(fixture.vesselId)) === 100, "drain routed loss reversed through the existing reverser");

      console.log(`\nPhase 6E long-tail verifier passed (${passed} assertions).`);
    } finally {
      await cleanup();
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
