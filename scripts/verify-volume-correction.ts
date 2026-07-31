/**
 * Recorded-volume correction verifier (feedback cms8a9nau0005i8045l65vomp).
 *
 * Demo Winery only, on a `ZZ-VOLCORR-*` fixture that is torn down at both ends. It reproduces the
 * reported case exactly — a 225 L barrique SEEDed at 100 L — and proves the whole chain the unit
 * tests can't see: the ADJUST actually lands in `vessel_lot`, the op is balanced and carries the
 * reason, an audit row exists, capacity is still enforced, and the correction is itself undoable.
 *
 * This exists because the last phase shipped a green suite over a read path no product surface
 * called. A pure planner passing is not evidence that a barrel's number changed.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { correctRecordedVolumeCore } from "@/lib/cellar/volume-correction-core";
import { correctOperationCore } from "@/lib/cellar/correct";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-volume-correction" };
const prefix = `ZZ-VOLCORR-${Date.now().toString(36)}`;
let passed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

async function expectThrows(fn: () => Promise<unknown>, match: RegExp, msg: string) {
  let threw: string | null = null;
  try {
    await fn();
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  assert(threw != null && match.test(threw), `${msg} (got: ${threw ?? "no error"})`);
}

async function cleanup() {
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } }).catch(() => []);
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const lotIds = lots.map((l) => l.id);
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const vesselIds = vessels.map((v) => v.id);

  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
  // Break the self-FK before deleting, or the CORRECTION row pins the op it corrects.
  await prisma.lotOperation.updateMany({ where: { id: { in: opIds } }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.costLine.deleteMany({ where: { OR: [{ operationId: { in: opIds } }, { lotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.operationCostTransfer.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: opIds } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { vesselId: { in: vesselIds } }] } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: vesselIds } } }).catch(() => {});
}

/** The reported shape: a 225 L barrique whose fill was recorded as 100 L. */
async function makeFixture(): Promise<{ vesselId: string; lotId: string }> {
  const vessel = await prisma.vessel.create({
    data: { code: `${prefix}-B3`, type: "BARREL", capacityL: 225 },
    select: { id: true, code: true, capacityL: true },
  });
  const lot = await prisma.lot.create({ data: { code: `${prefix}-PN`, form: "WINE" }, select: { id: true, code: true } });
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
    const { vesselId } = await makeFixture();

    console.log("\n── the reported case: 100 L recorded, 225 L actual ──");
    assert((await vesselTotal(vesselId)) === 100, "fixture barrel starts at the mistyped 100 L");

    const res = await correctRecordedVolumeCore(ACTOR, {
      vesselId,
      targetVolumeL: 225,
      reason: "fill volume mistyped at 100 instead of 225",
    });
    assert(res.operationId != null, "a correction operation was written");
    assert(res.deltaL === 125 && res.fromL === 100 && res.toL === 225, "the result states 100 → 225 (+125 L)");

    // THE assertion this whole feature is about: the number a winemaker reads actually changed.
    assert((await vesselTotal(vesselId)) === 225, "vessel_lot now reads 225 L — the projection the UI renders");

    const op = await prisma.lotOperation.findUniqueOrThrow({
      where: { id: res.operationId as number },
      include: { lines: true },
    });
    assert(op.type === "ADJUST", "the op is an ADJUST (the ledger's own 'correct a vessel's volume' type)");
    const meta = (op.metadata ?? {}) as Record<string, unknown>;
    assert(meta.adjustKind === "RECORDED_VOLUME_CORRECTION", "metadata marks it a recorded-volume correction, not a physical move");
    assert(meta.reason === "fill volume mistyped at 100 instead of 225", "the operator's reason is persisted verbatim");
    assert(meta.fromL === 100 && meta.toL === 225, "metadata carries both the old and the new number");
    assert(String(op.note ?? "").includes("mistyped"), "the reason also reaches the human-readable note");

    const sum = op.lines.reduce((a, l) => a + Number(l.deltaL), 0);
    assert(Math.abs(sum) < 1e-6, "the operation is balanced (legs sum to zero)");
    const vesselLeg = op.lines.find((l) => l.vesselId === vesselId);
    const externalLeg = op.lines.find((l) => l.vesselId === null);
    assert(Number(vesselLeg?.deltaL) === 125, "the vessel leg adds the missing 125 L");
    assert(externalLeg?.reason === "adjust", "the counter-leg is tagged `adjust`, so the TTB fold treats it as a book-vs-physical difference");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "LotOperation", entityId: String(res.operationId), actorEmail: ACTOR.actorEmail },
    });
    assert(audit != null, "an audit row names who corrected it");

    console.log("\n── guards ──");
    const noop = await correctRecordedVolumeCore(ACTOR, { vesselId, targetVolumeL: 225, reason: "again" });
    assert(noop.operationId === null && (await vesselTotal(vesselId)) === 225, "re-submitting the same number writes nothing");

    await expectThrows(
      () => correctRecordedVolumeCore(ACTOR, { vesselId, targetVolumeL: 400, reason: "too much" }),
      /can't be corrected/i,
      "a correction past capacity is refused",
    );
    await expectThrows(
      () => correctRecordedVolumeCore(ACTOR, { vesselId, targetVolumeL: 150, reason: "   " }),
      /reason/i,
      "a correction with no reason is refused",
    );
    await expectThrows(
      () => correctRecordedVolumeCore(ACTOR, { vesselId, targetVolumeL: 0, reason: "empty it" }),
      /greater than 0/i,
      "emptying a vessel is routed to Dump, not to the typo path",
    );
    assert((await vesselTotal(vesselId)) === 225, "every refusal left the books untouched");

    console.log("\n── the correction is itself correctable ──");
    await correctOperationCore(ACTOR, { operationId: res.operationId as number });
    assert((await vesselTotal(vesselId)) === 100, "undoing the correction restores the original 100 L");

    await cleanup();
  });
  console.log(`\nALL ${passed} VOLUME-CORRECTION ASSERTIONS PASSED.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await runAsTenant(TENANT, cleanup).catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
