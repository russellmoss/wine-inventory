import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planVesselLoss, type VesselLotBalance } from "@/lib/ledger/math";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { vesselLabel, type CellarBaseResult } from "@/lib/cellar/addition";

// Script-safe cores for the remaining single-vessel cellar ops (Phase 3, Unit 5):
//  - Cap management (PUMPOVER / PUNCHDOWN): volume-NEUTRAL, near-zero data — a CAP_MGMT op
//    with no lines + a minimal LotTreatment per resident lot.
//  - Filtration: volume-CHANGING — a FILTRATION op carrying an external loss line
//    (reason "filtration", proportional across the vessel's lots) PLUS a LotTreatment
//    (medium / micron) per affected lot.
// (Fining lives in addition.ts — it shares the neutral-dose engine. Loss is in loss.ts.)
// Everything routes through the chokepoint; nothing recomputes on read (VISION D14).

async function residentBalances(vesselId: string) {
  return prisma.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
}

export type CapKind = "PUMPOVER" | "PUNCHDOWN";

export type CapManagementInput = {
  vesselId: string;
  kind: CapKind;
  durationMin?: number | null;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string;
};

const CAP_LABELS: Record<CapKind, string> = { PUMPOVER: "Pump-over", PUNCHDOWN: "Punch-down" };

/** Cap management: one-tap, volume-neutral, typed + provenance-bearing (no free-text note only). */
export async function capManagementCore(actor: LedgerActor, input: CapManagementInput): Promise<CellarBaseResult> {
  const { vesselId, kind } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");
  if (kind !== "PUMPOVER" && kind !== "PUNCHDOWN") throw new ActionError("Pick pump-over or punch-down.");

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await residentBalances(vesselId);
  if (residents.length === 0) throw new ActionError(`${vesselLabel(vessel)} is empty.`);

  const durationMin =
    input.durationMin != null && Number.isFinite(input.durationMin) && input.durationMin > 0
      ? Math.round(input.durationMin)
      : null;
  const durClause = durationMin ? ` (${durationMin} min)` : "";
  const summary = `${CAP_LABELS[kind]} on ${vesselLabel(vessel)}${durClause}`;

  const { operationId, treatmentIds } = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "CAP_MGMT",
      lines: [],
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      lotCodes: new Map(),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
    });
    if (input.batchId) await tx.lotOperation.update({ where: { id: opId }, data: { batchId: input.batchId } });
    const ids: string[] = [];
    for (const r of residents) {
      const row = await tx.lotTreatment.create({
        data: {
          operationId: opId,
          lotId: r.lotId,
          vesselId,
          kind,
          durationMin,
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(opId),
      summary,
    });
    return { operationId: opId, treatmentIds: ids };
  });

  return { operationId, message: `${summary}.`, treatmentIds };
}

export type FiltrationInput = {
  vesselId: string;
  lossL: number;
  medium?: string;
  micron?: number | null;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string;
};

/** Filtration: a measured/estimated volume loss (reason "filtration") + a medium/micron treatment. */
export async function filterVesselCore(actor: LedgerActor, input: FiltrationInput): Promise<CellarBaseResult> {
  const { vesselId } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");
  const lossL = round2(input.lossL);
  if (!(lossL > 0)) throw new ActionError("Enter the volume lost to the filter (greater than 0).");

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await residentBalances(vesselId);
  const total = round2(residents.reduce((a, r) => a + Number(r.volumeL), 0));
  if (total <= 0) throw new ActionError(`${vesselLabel(vessel)} is empty.`);
  if (lossL > total + 1e-9) throw new ActionError(`${vesselLabel(vessel)} only holds ${total} L; can't lose ${lossL} L.`);

  const balances: VesselLotBalance[] = residents.map((r) => ({ vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  const plan = planVesselLoss(balances, lossL, "filtration");

  const micron = input.micron != null && Number.isFinite(input.micron) && input.micron > 0 ? round2(input.micron) : null;
  const medium = input.medium?.trim() || null;
  const lotCodes = new Map(residents.map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([[vesselId, vessel.code]]);
  const capacityByVessel = new Map([[vesselId, Number(vessel.capacityL)]]);
  const detail = [medium, micron ? `${micron} µm` : null].filter(Boolean).join(", ");
  const summary = `Filtered ${vesselLabel(vessel)}${detail ? ` (${detail})` : ""} — ${plan.removedL} L loss`;

  const { operationId, treatmentIds } = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "FILTRATION",
      lines: plan.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    if (input.batchId) await tx.lotOperation.update({ where: { id: opId }, data: { batchId: input.batchId } });
    // One treatment per affected lot, carrying the medium/micron detail + a volume snapshot.
    const balByLot = new Map(balances.map((b) => [b.lotId, b.volumeL]));
    const ids: string[] = [];
    for (const p of plan.perLot) {
      const row = await tx.lotTreatment.create({
        data: {
          operationId: opId,
          lotId: p.lotId,
          vesselId,
          kind: "FILTRATION",
          medium,
          micron,
          volumeLAtAddition: round2(balByLot.get(p.lotId) ?? 0),
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(opId),
      summary,
    });
    return { operationId: opId, treatmentIds: ids };
  });

  return { operationId, message: `${summary}.`, treatmentIds };
}
