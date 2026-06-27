/**
 * Cutover verification (Phase 1, Units 5-9) against the live DB.
 *
 * Drives the REAL rack/revert/bottling code paths (cores called with an explicit actor)
 * and asserts that the legacy `vessel_component` projection the UI reads stays exactly
 * consistent with the ledger `vessel_lot` projection throughout — i.e. the app behaves
 * identically. Restores state at the end (rack->revert, bottle->delete) so it is safe to
 * run on live data.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-cutover.ts
 */
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/bottling/draw";
import { rackWineCore, revertTransferCore } from "@/lib/vessels/rack-core";
import { executeBottling, deleteBottling } from "@/lib/bottling/run";

const actor = { actorUserId: null, actorEmail: "system@verify-cutover" };
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}
const key = (vesselId: string, varietyId: string, vineyardId: string, vintage: number) =>
  `${vesselId}::${varietyId}::${vineyardId}::${vintage}`;

/** vessel_component (UI read model) must equal the lot-origin grouping of vessel_lot. */
async function assertComponentSync(label: string) {
  const vls = await prisma.vesselLot.findMany({ include: { lot: true } });
  const expected = new Map<string, number>();
  for (const vl of vls) {
    const o = vl.lot;
    if (!o.originVarietyId || !o.originVineyardId || o.vintageYear == null) continue;
    const k = key(vl.vesselId, o.originVarietyId, o.originVineyardId, o.vintageYear);
    expected.set(k, round2((expected.get(k) ?? 0) + Number(vl.volumeL)));
  }
  const comps = await prisma.vesselComponent.findMany();
  const actual = new Map(comps.map((c) => [key(c.vesselId, c.varietyId, c.vineyardId, c.vintage), round2(Number(c.volumeL))]));

  let drift = 0;
  for (const [k, v] of expected) if (actual.get(k) !== v) { drift++; console.error(`  ${label} MISMATCH ${k}: vessel_lot=${v} vessel_component=${actual.get(k) ?? "(none)"}`); }
  for (const [k, v] of actual) if (!expected.has(k)) { drift++; console.error(`  ${label} EXTRA component ${k}=${v}`); }
  assert(drift === 0, `${label}: vessel_component out of sync with vessel_lot (${drift} rows)`);
  console.log(`  ${label}: vessel_component == vessel_lot projection (${expected.size} tuples)`);
}

async function vesselTotal(vesselId: string) {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId }, select: { volumeL: true } });
  return round2(rows.reduce((a, r) => a + Number(r.volumeL), 0));
}

async function main() {
  await assertComponentSync("baseline");

  // ---------- RACK (real rackWineCore) ----------
  const src = await prisma.vesselLot.findFirst({ where: { volumeL: { gt: 10 } }, include: { lot: true, vessel: true } });
  assert(!!src, "need a vessel_lot > 10 L");
  if (!src) return;
  const occupied = new Set((await prisma.vesselLot.findMany({ select: { vesselId: true } })).map((r) => r.vesselId));
  const dest = await prisma.vessel.findFirst({ where: { isActive: true, id: { notIn: [...occupied] } } });
  assert(!!dest, "need an empty active vessel");
  if (!dest) return;

  const srcVesselStart = await vesselTotal(src.vesselId);
  const draw = round2(Math.min(40, srcVesselStart / 2));
  const rack = await rackWineCore(actor, { fromVesselId: src.vesselId, toVesselId: dest.id, drawL: draw });
  assert((await vesselTotal(dest.id)) === draw, "rack: dest holds the full draw (proportional across any blend)");
  assert((await vesselTotal(src.vesselId)) === round2(srcVesselStart - draw), "rack: source reduced by the draw");
  const tx = await prisma.vesselTransfer.findUnique({ where: { id: rack.transferId } });
  assert(!!tx && tx.lotOperationId != null, "rack: VesselTransfer read-model created + linked to the op");
  await assertComponentSync("after-rack");
  console.log(`  RACK ok: ${rack.message}`);

  // ---------- REVERT (real revertTransferCore) ----------
  const rev = await revertTransferCore(actor, { transferId: rack.transferId });
  assert((await vesselTotal(src.vesselId)) === srcVesselStart, "revert: source restored");
  assert((await vesselTotal(dest.id)) === 0, "revert: dest empty");
  const txAfter = await prisma.vesselTransfer.findUnique({ where: { id: rack.transferId } });
  assert(!!txAfter && txAfter.revertedAt != null, "revert: original transfer flagged reverted");
  await assertComponentSync("after-revert");
  console.log(`  REVERT ok: ${rev.message}`);

  // ---------- BOTTLING (real executeBottling/deleteBottling) ----------
  const loc = await prisma.location.findFirst({ where: { isActive: true } });
  assert(!!loc, "need an active location");
  if (!loc) return;
  const bottleVesselStart = await vesselTotal(src.vesselId);
  const skuName = "VERIFY-CUTOVER-DELETEME";
  await executeBottling({ vesselIds: [src.vesselId], destinationLocationId: loc.id, skuName, skuVintage: 2024, bottlesProduced: 1, date: new Date() }, actor);
  const run = await prisma.bottlingRun.findFirst({ where: { wineSku: { name: skuName } }, orderBy: { createdAt: "desc" }, include: { sources: true } });
  assert(!!run, "bottling: run created");
  if (!run) return;
  assert((await vesselTotal(src.vesselId)) === round2(bottleVesselStart - 0.75), "bottling: vessel reduced by 0.75 L");
  assert(run.sources.every((s) => s.lotId != null), "bottling: BottlingSource.lotId set on new run");
  const inv = await prisma.bottledInventory.findUnique({ where: { wineSkuId_locationId: { wineSkuId: run.wineSkuId, locationId: loc.id } } });
  assert(!!inv && inv.totalBottles >= 1, "bottling: BottledInventory incremented");
  await assertComponentSync("after-bottling");
  console.log(`  BOTTLING ok: 1 bottle, lotId provenance set, inventory +1`);

  // ---------- DELETE bottling (restore) ----------
  await deleteBottling(run.id, actor);
  assert((await vesselTotal(src.vesselId)) === bottleVesselStart, "delete-bottling: wine restored");
  await assertComponentSync("after-delete-bottling");
  console.log("  DELETE-BOTTLING ok: wine restored");

  await prisma.$disconnect();
  console.log("PASS: rack/revert/bottling all behave correctly; vessel_component stays identical to the ledger throughout.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
