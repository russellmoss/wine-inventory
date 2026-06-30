"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { planLotStateUpdate, type LotState, type StateVector } from "@/lib/ferment/state";
import { detectStuck, type StuckResult } from "@/lib/ferment/stuck";
import type { AlcoholicFermState, MalolacticState, LotForm } from "@/lib/ledger/vocabulary";

// Phase 6 Unit 10: advance the three orthogonal ferment vectors (form / AF / MLF) and surface the
// DERIVED stuck signal. Form is mutable ONLY through here (direct writes banned). Each transition
// writes a LotStateEvent (audit trail) + updates the relevant Lot column, validated against the
// Unit 5 matrix (planLotStateUpdate). commandId UNIQUE on LotStateEvent = duplicate-as-success.

export type TransitionInput = {
  lotId: string;
  kind: StateVector;
  to: string;
  vesselId?: string | null;
  commandId?: string | null;
  note?: string | null;
};

export type TransitionResult = {
  lotId: string;
  form: LotForm;
  afState: AlcoholicFermState;
  mlfState: MalolacticState;
  formAutoFlipped: boolean;
  duplicate: boolean;
};

function isCommandConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta ?? "").includes("commandId");
}

async function findEventByCommand(commandId: string): Promise<TransitionResult | null> {
  const ev = await prisma.lotStateEvent.findUnique({ where: { commandId }, select: { lotId: true } });
  if (!ev) return null;
  const lot = await prisma.lot.findUnique({ where: { id: ev.lotId }, select: { id: true, form: true, afState: true, mlfState: true } });
  if (!lot) return null;
  return {
    lotId: lot.id,
    form: lot.form as LotForm,
    afState: lot.afState,
    mlfState: lot.mlfState,
    formAutoFlipped: false,
    duplicate: true,
  };
}

export const transitionStateAction = action(async ({ actor }, input: TransitionInput): Promise<TransitionResult> => {
  if (input.commandId) {
    const prior = await findEventByCommand(input.commandId);
    if (prior) return prior;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      // Read CURRENT state inside the tx — re-validating from the fresh state is what stops two
      // concurrent transitions from interleaving incoherently (the optimistic guard).
      const lot = await tx.lot.findUnique({
        where: { id: input.lotId },
        select: { id: true, form: true, afState: true, mlfState: true, status: true },
      });
      if (!lot) throw new ActionError("Lot not found.");
      if (lot.status !== "ACTIVE") throw new ActionError(`Lot is ${lot.status.toLowerCase()}.`);

      const current: LotState = { form: lot.form as LotForm, afState: lot.afState, mlfState: lot.mlfState };
      const { update, event, formAutoFlipped } = planLotStateUpdate(current, { kind: input.kind, to: input.to });

      await tx.lotStateEvent.create({
        data: {
          lotId: input.lotId,
          vesselId: input.vesselId ?? null,
          kind: event.kind,
          fromValue: event.fromValue,
          toValue: event.toValue,
          observedAt: new Date(),
          enteredById: actor.actorUserId,
          enteredByEmail: actor.actorEmail,
          note: input.note?.trim() || null,
          commandId: input.commandId ?? null,
        },
      });
      await tx.lot.update({ where: { id: input.lotId }, data: update });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "Lot",
        entityId: input.lotId,
        summary: `${event.kind} ${event.fromValue}→${event.toValue}${formAutoFlipped ? ` (form→${update.form})` : ""}`,
      });

      revalidatePath(`/lots/${input.lotId}`);
      revalidatePath("/ferment/round");
      return {
        lotId: input.lotId,
        form: (update.form ?? current.form) as LotForm,
        afState: (update.afState ?? current.afState) as AlcoholicFermState,
        mlfState: (update.mlfState ?? current.mlfState) as MalolacticState,
        formAutoFlipped,
        duplicate: false,
      } satisfies TransitionResult;
    });
  } catch (e) {
    if (input.commandId && isCommandConflict(e)) {
      const prior = await findEventByCommand(input.commandId);
      if (prior) return prior;
    }
    throw e;
  }
});

/** DERIVED stuck signal for one lot: recompute over ALL non-voided BRIX (winery-tz day buckets)
 * so a late offline backfill self-corrects (never stored). */
export async function stuckForLot(lotId: string, afState: AlcoholicFermState): Promise<StuckResult> {
  const rows = await prisma.analysisReading.findMany({
    where: { analyte: "BRIX", panel: { lotId, voidedAt: null } },
    select: { value: true, panel: { select: { observedAt: true } } },
  });
  return detectStuck(
    rows.map((r) => ({ observedAt: r.panel.observedAt, brix: Number(r.value) })),
    { afState },
  );
}
