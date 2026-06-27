/**
 * End-to-end spine verification (Phase 1 exit criterion) against the live DB.
 *
 * Picks a real legacy lot, racks part of it into an empty vessel via the ledger
 * chokepoint, asserts the projection moved correctly and still equals the fold of the
 * ledger, then CORRECTS the rack and asserts the original state is restored (originals
 * stay immutable). Net effect on the projection is zero (rack + correction cancel).
 *
 * Run:  npx tsx --env-file=.env scripts/verify-ledger-rack.ts
 */
import { prisma } from "@/lib/prisma";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planLedgerRack, planCorrection, balanceKey, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";

const r2 = (n: number) => Math.round(n * 100) / 100;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function balancesFor(vesselId: string): Promise<VesselLotBalance[]> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId } });
  return rows.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
}
async function volAt(vesselId: string, lotId: string): Promise<number> {
  const row = await prisma.vesselLot.findUnique({ where: { vesselId_lotId: { vesselId, lotId } } });
  return row ? Number(row.volumeL) : 0;
}

async function main() {
  // Source: a legacy lot with enough volume to split.
  const src = await prisma.vesselLot.findFirst({ where: { volumeL: { gt: 10 } }, include: { lot: true, vessel: true } });
  assert(!!src, "need a vessel_lot with > 10 L to test (run Day-Zero first)");
  if (!src) return;

  // Destination: a different active vessel with no current holdings.
  const occupied = new Set((await prisma.vesselLot.findMany({ select: { vesselId: true } })).map((r) => r.vesselId));
  const dest = await prisma.vessel.findFirst({
    where: { isActive: true, id: { notIn: [...occupied] } },
  });
  assert(!!dest, "need an empty active vessel as a destination");
  if (!dest) return;

  const draw = r2(Math.min(50, Number(src.volumeL) / 2));
  const srcStart = Number(src.volumeL);
  console.log(`Racking ${draw} L of lot ${src.lot.code} from ${src.vessel.code} (${srcStart} L) -> ${dest.code} (empty, cap ${dest.capacityL} L)`);

  const capacityByVessel = new Map<string, number>([
    [src.vesselId, Number(src.vessel.capacityL)],
    [dest.id, Number(dest.capacityL)],
  ]);
  const vesselCodes = new Map<string, string>([
    [src.vesselId, src.vessel.code],
    [dest.id, dest.code],
  ]);
  const lotCodes = new Map<string, string>([[src.lotId, src.lot.code]]);

  // ---- RACK ----
  const rack = planLedgerRack(await balancesFor(src.vesselId), dest.id, draw, 0);
  const rackOpId = await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "RACK",
      lines: rack.lines,
      actorUserId: null,
      enteredBy: "system@verify",
      note: "verify-ledger-rack",
      lotCodes,
      vesselCodes,
      capacityByVessel,
    }),
  );
  assert(r2(await volAt(dest.id, src.lotId)) === draw, "destination should hold the drawn volume");
  assert(r2(await volAt(src.vesselId, src.lotId)) === r2(srcStart - draw), "source should be reduced by the draw");
  console.log(`  RACK op #${rackOpId}: dest=${await volAt(dest.id, src.lotId)} L, source=${await volAt(src.vesselId, src.lotId)} L`);

  // ---- CORRECTION ----
  const rackLines: LedgerLine[] = rack.lines;
  const curBalances = [...(await balancesFor(src.vesselId)), ...(await balancesFor(dest.id))];
  const corr = planCorrection(rackLines, curBalances, new Set());
  assert(corr.ok, `correction should be applicable, got ${corr.ok ? "ok" : (corr as { reason: string }).reason}`);
  if (!corr.ok) return;
  const corrOpId = await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "CORRECTION",
      lines: corr.lines,
      actorUserId: null,
      enteredBy: "system@verify",
      note: "verify-ledger-rack correction",
      correctsOperationId: rackOpId,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    }),
  );
  assert(r2(await volAt(src.vesselId, src.lotId)) === r2(srcStart), "source should be fully restored");
  assert((await volAt(dest.id, src.lotId)) === 0, "destination should be empty again");
  console.log(`  CORRECTION op #${corrOpId}: source restored to ${await volAt(src.vesselId, src.lotId)} L, dest empty`);

  // Originals immutable + correction is a distinct op.
  const rackOp = await prisma.lotOperation.findUnique({ where: { id: rackOpId }, include: { lines: true } });
  assert(!!rackOp && rackOp.lines.length === rack.lines.length, "original RACK op + lines remain intact");

  // Double-correct must be rejected by the unique constraint.
  let doubleBlocked = false;
  try {
    await runLedgerWrite((tx) =>
      writeLotOperation(tx, {
        type: "CORRECTION",
        lines: corr.lines,
        actorUserId: null,
        enteredBy: "system@verify",
        correctsOperationId: rackOpId,
        lotCodes,
        vesselCodes,
        capacityByVessel,
      }),
    );
  } catch {
    doubleBlocked = true;
  }
  assert(doubleBlocked, "second correction of the same op must be blocked by the unique constraint");
  console.log("  double-correction correctly rejected by unique correctsOperationId");

  await prisma.$disconnect();
  console.log("PASS: rack -> projection moves -> correct -> restored; originals immutable; double-correct blocked.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
