import type { Prisma } from "@prisma/client";
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

// Phase 6: cold soak + extended maceration are non-volumetric cap-work too (council "cap mgmt
// reused + extended"). They reuse the CAP_MGMT op + LotTreatment row (kind is a validated string,
// NOT a DB enum — no migration). The orthogonal vectors make both representable: cold soak =
// MUST + afState:NONE (pre-ferment); extended maceration = MUST + afState:DRY (post-ferment, still
// on skins) — the old linear phase enum couldn't express "dry but on skins".
export type CapKind = "PUMPOVER" | "PUNCHDOWN" | "COLD_SOAK" | "MACERATION";

export const CAP_KINDS: readonly CapKind[] = ["PUMPOVER", "PUNCHDOWN", "COLD_SOAK", "MACERATION"] as const;

export function isCapKind(v: unknown): v is CapKind {
  return typeof v === "string" && (CAP_KINDS as readonly string[]).includes(v);
}

export type CapManagementInput = {
  vesselId: string;
  kind: CapKind;
  durationMin?: number | null;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string;
};

const CAP_LABELS: Record<CapKind, string> = {
  PUMPOVER: "Pump-over",
  PUNCHDOWN: "Punch-down",
  COLD_SOAK: "Cold soak",
  MACERATION: "Maceration",
};

/** Cap management: one-tap, volume-neutral, typed + provenance-bearing (no free-text note only). */
export async function capManagementCore(actor: LedgerActor, input: CapManagementInput): Promise<CellarBaseResult> {
  const { vesselId, kind } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");
  if (!isCapKind(kind)) throw new ActionError("Pick a valid cap-management action.");

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
  /**
   * A5: the measured output volume after filtering (a completion input; default = pre-filtration). When
   * given, the loss = pre-filtration total − actualOutputL (filtration loss varies wildly by media —
   * cross-flow ~0.1%, pad ~3%, lees ~20% — so it must NOT be a hardcoded rate). Takes precedence over lossL.
   */
  actualOutputL?: number | null;
  medium?: string;
  micron?: number | null;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string;
};

/**
 * A2 tx-form: filtration inside a caller-provided ledger tx (composed by the work-order execute seam). ALL
 * guards live here (the WO seam calls this directly — the Phase-9 lesson). Allows a ZERO loss (a filtration
 * whose volume loss is negligible/unmeasured still records the FILTRATION op + medium/micron treatment, like
 * a lines-empty CAP_MGMT). Reads resident balances via the tx so it shares the tenant-scoped snapshot.
 */
export async function filterVesselTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: FiltrationInput,
): Promise<{ operationId: number; treatmentIds: string[]; summary: string; removedL: number }> {
  const { vesselId } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");

  const vessel = await tx.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await tx.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
  const total = round2(residents.reduce((a, r) => a + Number(r.volumeL), 0));
  if (total <= 0) throw new ActionError(`${vesselLabel(vessel)} is empty.`);

  // A5: prefer the measured output volume (loss = pre − actual); fall back to a directly-entered loss.
  let lossL: number;
  if (input.actualOutputL != null && Number.isFinite(input.actualOutputL)) {
    const out = round2(input.actualOutputL);
    if (out < 0) throw new ActionError("Output volume can't be negative.");
    if (out > total + 1e-9) throw new ActionError(`${vesselLabel(vessel)} holds ${total} L; output can't exceed that.`);
    lossL = round2(total - out);
  } else {
    lossL = round2(input.lossL);
  }
  if (!(lossL >= 0)) throw new ActionError("Filtration loss can't be negative.");
  if (lossL > total + 1e-9) throw new ActionError(`${vesselLabel(vessel)} only holds ${total} L; can't lose ${lossL} L.`);

  const balances: VesselLotBalance[] = residents.map((r) => ({ vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  // Zero loss → no volume lines (a lines-empty FILTRATION op, like CAP_MGMT); >0 → proportional loss.
  const plan = lossL > 0 ? planVesselLoss(balances, lossL, "filtration") : { removedL: 0, lines: [], perLot: [] };

  const micron = input.micron != null && Number.isFinite(input.micron) && input.micron > 0 ? round2(input.micron) : null;
  const medium = input.medium?.trim() || null;
  const lotCodes = new Map(residents.map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([[vesselId, vessel.code]]);
  const capacityByVessel = new Map([[vesselId, Number(vessel.capacityL)]]);
  const detail = [medium, micron ? `${micron} µm` : null].filter(Boolean).join(", ");
  const summary = `Filtered ${vesselLabel(vessel)}${detail ? ` (${detail})` : ""} — ${plan.removedL} L loss`;

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
  // One treatment per affected lot when loss occurred; if zero-loss, one per resident lot (records the medium).
  const balByLot = new Map(balances.map((b) => [b.lotId, b.volumeL]));
  const affected = plan.perLot.length > 0 ? plan.perLot.map((p) => p.lotId) : residents.map((r) => r.lotId);
  const ids: string[] = [];
  for (const lotId of affected) {
    const row = await tx.lotTreatment.create({
      data: {
        operationId: opId,
        lotId,
        vesselId,
        kind: "FILTRATION",
        medium,
        micron,
        volumeLAtAddition: round2(balByLot.get(lotId) ?? 0),
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
  return { operationId: opId, treatmentIds: ids, summary, removedL: plan.removedL };
}

/** Filtration: a measured/estimated volume loss (reason "filtration") + a medium/micron treatment. */
export async function filterVesselCore(actor: LedgerActor, input: FiltrationInput): Promise<CellarBaseResult> {
  if (!input.vesselId) throw new ActionError("A vessel is required.");
  // Manual /cellar path requires a measured loss (the form is loss-first); the WO path allows zero.
  if (!(round2(input.lossL) > 0)) throw new ActionError("Enter the volume lost to the filter (greater than 0).");
  const { operationId, treatmentIds, summary } = await runLedgerWrite((tx) => filterVesselTx(tx, actor, input));
  return { operationId, message: `${summary}.`, treatmentIds };
}
