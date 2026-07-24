/**
 * verify:owner-model — Plan 093 Unit 11. The FOUNDATION PROOF for the custom-crush ownership model, run
 * with NO owner-scope RLS (that is plan 092). Shape B: runAsTenant("org_demo_winery"), QA-prefixed
 * fixtures, drives the REAL cores, asserts via a counter, scrubs in a finally block. Demo tenant only.
 *
 * Proves: ownerId inheritance across blend + reversal; descendant rows carry the lot's owner (never
 * re-derived from lineage); CHANGE_OWNERSHIP is conditional (same bond = title-only ZERO TTB) + reversible;
 * cross-owner blends are ALLOWED + billed + voided on reversal; AP-owner bond precedence; facility wine
 * stays NULL; ownerLabel.
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { correctBlendCore } from "@/lib/blend/blend-correct";
import { changeOwnershipCore, reverseChangeOwnershipCore } from "@/lib/owner/change-ownership-core";
import { deriveBond } from "@/lib/compliance/bond";
import { ownerLabel } from "@/lib/owner/data";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-owner-model" };
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } }

async function seedLot(code: string, ownerId: string | null, vesselId: string, vol: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE", ownerId }, select: { id: true } });
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId }, select: { code: true, capacityL: true } });
  await runLedgerWrite((tx) => writeLotOperation(tx, {
    type: "SEED",
    lines: [{ lotId: lot.id, vesselId, deltaL: vol }, { lotId: lot.id, vesselId: null, deltaL: -vol, reason: "seed" }],
    actorUserId: null, enteredBy: ACTOR.actorEmail, note: "owner-model seed",
    lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map([[vesselId, vessel.code]]), capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
  }));
  return lot.id;
}
const mkVessel = (code: string, cap = 2000) => prisma.vessel.create({ data: { code, type: "TANK", capacityL: cap }, select: { id: true } });

async function scrub() {
  const owners = await prisma.owner.findMany({ where: { name: { startsWith: "QA-OM" } }, select: { id: true } });
  const ownerIds = owners.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { OR: [{ code: { startsWith: "QA-OM" } }, { ownerId: { in: ownerIds } }] }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((o) => o.id);
  await prisma.billableWineConsumed.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { operationId: { in: opIds } }] } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: opIds } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "QA-OM" } } }).catch(() => {});
  await prisma.bond.deleteMany({ where: { registryNumber: { startsWith: "QA-OM" } } }).catch(() => {});
  await prisma.owner.deleteMany({ where: { id: { in: ownerIds } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
}

async function main() {
  await runAsTenant("org_demo_winery", async () => {
    await scrub();
    try {
      const clientA = await prisma.owner.create({ data: { name: "QA-OM Client A", kind: "CUSTOM_CRUSH_CLIENT" }, select: { id: true } });
      const clientB = await prisma.owner.create({ data: { name: "QA-OM Client B", kind: "CUSTOM_CRUSH_CLIENT" }, select: { id: true } });
      const apOwner = await prisma.owner.create({ data: { name: "QA-OM AP Proprietor", kind: "AP_PROPRIETOR" }, select: { id: true } });
      const apBond = await prisma.bond.create({ data: { registryNumber: "QA-OM-BWN-2", ownerId: apOwner.id }, select: { id: true } });

      console.log("── ownerLabel + facility NULL ──");
      assert(ownerLabel(null) === "Estate (facility)", "ownerLabel(NULL) = Estate (facility)");
      assert(ownerLabel({ name: "QA-OM Client A" }) === "QA-OM Client A", "ownerLabel(owner) = its name");

      console.log("── descendant rows carry the lot's owner (4a; not lineage) ──");
      const t1 = await mkVessel("QA-OM-T1");
      const lotA = await seedLot("QA-OM-A", clientA.id, t1.id, 600);
      const vl = await prisma.vesselLot.findFirst({ where: { lotId: lotA }, select: { ownerId: true } });
      const opLine = await prisma.lotOperationLine.findFirst({ where: { lotId: lotA, deltaL: { gt: 0 } }, select: { ownerId: true } });
      assert(vl?.ownerId === clientA.id, "vessel_lot row carries the lot's owner");
      assert(opLine?.ownerId === clientA.id, "lot_operation_line row carries the lot's owner");
      const estLot = await seedLot("QA-OM-EST", null, (await mkVessel("QA-OM-TE")).id, 300);
      const estVl = await prisma.vesselLot.findFirst({ where: { lotId: estLot }, select: { ownerId: true } });
      assert(estVl?.ownerId === null, "facility (NULL owner) lot's rows stay NULL");

      console.log("── ownerId inherits across blend + reversal ──");
      const t2 = await mkVessel("QA-OM-T2");
      const lotA2 = await seedLot("QA-OM-A2", clientA.id, t2.id, 400);
      const dest = await mkVessel("QA-OM-DST");
      const blend = await blendLotsCore(ACTOR, { mode: "NEW_LOT", token: "QOM", components: [{ vesselId: t1.id, lotId: lotA, drawL: 600 }, { vesselId: t2.id, lotId: lotA2, drawL: 400 }], toVesselId: dest.id });
      const child = await prisma.lot.findUnique({ where: { id: blend.childLotId }, select: { ownerId: true } });
      assert(child?.ownerId === clientA.id, "same-owner blend child inherits the owner");
      await correctBlendCore(ACTOR, { operationId: blend.operationId });
      // parents restored owned
      const a1 = await prisma.lot.findUnique({ where: { id: lotA }, select: { ownerId: true } });
      assert(a1?.ownerId === clientA.id, "reversal keeps the parent's owner");

      console.log("── CHANGE_OWNERSHIP: title-only (same bond) + reversible ──");
      const co = await changeOwnershipCore(ACTOR, { lotId: lotA, newOwnerId: clientB.id });
      assert(co.kind === "TITLE_ONLY", `client→client on the same bond is title-only (got ${co.kind})`);
      const lines = await prisma.lotOperationLine.count({ where: { operationId: co.operationId } });
      assert(lines === 0, "title-only posts ZERO TTB lines");
      const moved = await prisma.lot.findUnique({ where: { id: lotA }, select: { ownerId: true } });
      assert(moved?.ownerId === clientB.id, "lot re-stamped to the new owner");
      await reverseChangeOwnershipCore(ACTOR, { operationId: co.operationId });
      const back = await prisma.lot.findUnique({ where: { id: lotA }, select: { ownerId: true } });
      assert(back?.ownerId === clientA.id, "reversal restores the prior owner");

      console.log("── cross-owner blend ALLOWED + billed + voided on reversal ──");
      const t3 = await mkVessel("QA-OM-T3");
      const t4 = await mkVessel("QA-OM-T4");
      const lotClient = await seedLot("QA-OM-CL", clientA.id, t3.id, 500);
      const lotFac = await seedLot("QA-OM-FAC", null, t4.id, 200);
      const dest2 = await mkVessel("QA-OM-DS2");
      const xblend = await blendLotsCore(ACTOR, { mode: "NEW_LOT", token: "QOX", components: [{ vesselId: t3.id, lotId: lotClient, drawL: 500 }, { vesselId: t4.id, lotId: lotFac, drawL: 200 }], toVesselId: dest2.id });
      assert(!!xblend.operationId, "cross-owner blend SUCCEEDS (not refused)");
      const bills = await prisma.billableWineConsumed.findMany({ where: { operationId: xblend.operationId } });
      assert(bills.length === 1, `one BILLABLE_WINE_CONSUMED for the minority (got ${bills.length})`);
      await correctBlendCore(ACTOR, { operationId: xblend.operationId });
      const voided = await prisma.billableWineConsumed.findMany({ where: { operationId: xblend.operationId } });
      assert(voided.every((b) => b.status === "VOID"), "reversal VOIDs the billing rows");

      console.log("── AP-owner bond precedence ──");
      const t5 = await mkVessel("QA-OM-T5");
      const apLot = await seedLot("QA-OM-AP", apOwner.id, t5.id, 300);
      const derived = await deriveBond(apLot, new Date(), prisma as never);
      assert(derived === apBond.id, "an AP-owned lot derives its owner's own bond (precedence over primary)");
      const facBond = await deriveBond(estLot, new Date(), prisma as never);
      assert(facBond !== apBond.id, "a facility lot does NOT get the AP bond");
    } finally {
      await scrub();
    }
    console.log(`\n${fail === 0 ? "ALL " + pass : fail + " FAILED / " + (pass + fail)} owner-model assertions ${fail === 0 ? "PASSED ✓" : ""}`);
  });
}
main().then(() => process.exit(fail === 0 ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });
