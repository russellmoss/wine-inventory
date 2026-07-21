import type { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { LINEAGE_KIND } from "@/lib/lot/lineage";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planLedgerRack, type VesselLotBalance } from "@/lib/ledger/math";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { vesselLabel, type CellarBaseResult } from "@/lib/cellar/addition";
import { decideCombineRoute } from "@/lib/ledger/combine";
import { loadCombineState } from "@/lib/ledger/combine-state";

// Script-safe core for TOPPING (Phase 3, Unit 6). Topping is a TRANSFER, not an additive:
// it moves wine from a source keg lot into the target via the rack mechanic
// (planLedgerRack), under op type TOPPING, and appends a LotLineage edge from the keg lot
// to each pre-existing target lot (kind TOPPING) so the micro-merge is recorded.
//
// Plan 088 (LEDGER-12): the keg wine no longer becomes CO-RESIDENT in the target. A vessel
// holds one cohesive liquid, so the topped-up wine ABSORBS — it lands as the resident lot and
// the keg lot simply leaves its own vessel. Op type stays TOPPING so the 5120.17 fold still
// treats it as cellar practice rather than a declarable blend (lines 5 / 20); Vintrace
// documents the same separation ("Topping Without Updating Wine Composition"). Capacity is
// guarded by the chokepoint.

export type ToppingInput = {
  toVesselId: string;
  fromVesselId: string; // the source keg vessel (holds the keg lot)
  volumeL: number;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string;
};

export type ToppingResult = CellarBaseResult & { addedL: number; lineageEdges: number };

type DbClient = Prisma.TransactionClient;

async function loadVesselLots(vesselId: string, client: DbClient = prisma as unknown as DbClient) {
  return client.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
}

/** Top the target vessel from a source keg lot WITHIN the caller's tx (Phase 9 A2) — reads + writes
 * through `tx` so WO completion composes it with the attempt row in one runLedgerWrite. */
export async function topVesselTx(tx: Prisma.TransactionClient, actor: LedgerActor, input: ToppingInput): Promise<ToppingResult> {
  const { toVesselId, fromVesselId } = input;
  if (!toVesselId || !fromVesselId) throw new ActionError("A source keg and a target vessel are both required.");
  if (toVesselId === fromVesselId) throw new ActionError("Source and target must be different vessels.");
  const volumeL = round2(input.volumeL);
  if (!(volumeL > 0)) throw new ActionError("Enter a topping volume greater than 0.");

  const [from, to] = await Promise.all([
    tx.vessel.findUnique({ where: { id: fromVesselId } }),
    tx.vessel.findUnique({ where: { id: toVesselId } }),
  ]);
  if (!from) throw new ActionError("Source keg not found.");
  if (!to) throw new ActionError("Target vessel not found.");
  if (!from.isActive) throw new ActionError(`${vesselLabel(from)} is inactive.`);
  if (!to.isActive) throw new ActionError(`${vesselLabel(to)} is inactive.`);

  const [srcLots, dstLots] = await Promise.all([loadVesselLots(fromVesselId, tx), loadVesselLots(toVesselId, tx)]);
  const srcTotal = round2(srcLots.reduce((a, r) => a + Number(r.volumeL), 0));
  if (srcTotal <= 0) throw new ActionError(`${vesselLabel(from)} is empty — nothing to top from.`);
  if (volumeL > srcTotal + 1e-9) throw new ActionError(`${vesselLabel(from)} only holds ${srcTotal} L; can't top ${volumeL} L.`);

  const dstTotalBefore = round2(dstLots.reduce((a, r) => a + Number(r.volumeL), 0));
  const toCapacity = Number(to.capacityL);
  if (dstTotalBefore + volumeL > toCapacity + 1e-9) {
    throw new ActionError(
      `That would exceed ${vesselLabel(to)}'s ${toCapacity} L capacity (it holds ${dstTotalBefore} L, adding ${volumeL} L).`,
      "CONFLICT",
    );
  }

  const balances: VesselLotBalance[] = srcLots.map((r) => ({ vesselId: fromVesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  const plan = planLedgerRack(balances, toVesselId, volumeL, 0); // topping loses nothing
  const addedL = plan.addedL;
  const dstTotalAfter = round2(dstTotalBefore + addedL);

  // Volume each source (keg) lot contributed — the lineage fraction, and the basis for the
  // absorb redirect below. Read BEFORE the lines are remapped.
  const contributedBySrc = new Map<string, number>();
  for (const l of plan.lines) {
    if (l.vesselId === toVesselId && l.deltaL > 0) {
      contributedBySrc.set(l.lotId, round2((contributedBySrc.get(l.lotId) ?? 0) + l.deltaL));
    }
  }

  // LEDGER-12: topping used to leave the keg wine sitting beside the target as a SECOND resident
  // ("it does NOT mint a new blend lot — the keg wine becomes co-resident"). A tank holds one
  // cohesive liquid, so the topped-up wine now ABSORBS into the resident: it keeps the target's
  // identity and the keg lot simply leaves its vessel (plan 088, Unit 7).
  const state = await loadCombineState({ toVesselId, incomingLotIds: [...contributedBySrc.keys()] }, tx);
  const decision = decideCombineRoute({ destResidentLots: state.destResidentLots, incoming: state.incoming });
  if (!decision.ok) throw new ActionError(decision.message, "CONFLICT");

  // ABSORB → the wine arrives as the resident lot. KEEP (empty target, or the keg lot is already
  // the resident) leaves the lines exactly as planned.
  const lines =
    decision.mode === "ABSORB" && decision.residentLotId
      ? plan.lines.map((l) =>
          l.vesselId === toVesselId && l.deltaL > 0 ? { ...l, lotId: decision.residentLotId as string } : l,
        )
      : plan.lines;

  // Pre-existing target lots become the lineage children (exclude any keg lot just moved in).
  const childLots = dstLots.map((r) => r.lotId).filter((id) => !contributedBySrc.has(id));

  const lotCodes = new Map([...srcLots, ...dstLots].map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([
    [fromVesselId, from.code],
    [toVesselId, to.code],
  ]);
  const capacityByVessel = new Map([
    [fromVesselId, Number(from.capacityL)],
    [toVesselId, toCapacity],
  ]);
  const summary = `Topped ${addedL} L from ${vesselLabel(from)} into ${vesselLabel(to)}`;

  // Op type stays TOPPING on purpose: the 5120.17 fold treats topping as cellar practice, NOT a
  // declarable blend (lines 5 / 20). Absorbing changes which lot the wine lands as; it must not
  // turn a top-up into a reportable blending event.
  const opId = await writeLotOperation(tx, {
    type: "TOPPING",
    lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    captureMethod: input.captureMethod,
    note: input.note?.trim() || null,
    lotCodes,
    vesselCodes,
    capacityByVessel,
  });
  if (input.batchId) await tx.lotOperation.update({ where: { id: opId }, data: { batchId: input.batchId } });

  // Append lineage: each keg lot → each pre-existing target lot (micro-merge, no new lot).
  let lineageEdges = 0;
  for (const [srcLotId, contributed] of contributedBySrc) {
    const fraction = dstTotalAfter > 0 ? Math.min(0.99999, round5(contributed / dstTotalAfter)) : null;
    for (const childLotId of childLots) {
      if (srcLotId === childLotId) continue;
      await tx.lotLineage.upsert({
        where: { parentLotId_childLotId: { parentLotId: srcLotId, childLotId } },
        create: { parentLotId: srcLotId, childLotId, kind: LINEAGE_KIND.TOPPING, fraction },
        update: { fraction, kind: LINEAGE_KIND.TOPPING },
      });
      lineageEdges++;
    }
  }
  await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(opId), summary });

  return { operationId: opId, message: `${summary}.`, treatmentIds: [], addedL, lineageEdges };
}

/** Top the target vessel from a source keg lot. Standalone wrapper — owns the SERIALIZABLE tx. */
export async function topVesselCore(actor: LedgerActor, input: ToppingInput): Promise<ToppingResult> {
  return runLedgerWrite((tx) => topVesselTx(tx, actor, input));
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
