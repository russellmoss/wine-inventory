import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { TastingScoreScale, TastingReadiness } from "@prisma/client";

// Off-ledger bench-trial cores (Phase 5, Unit 9). Trials are throwaway tasting experiments —
// they NEVER touch the ledger. Only PROMOTE turns a chosen trial into a real BLEND, and that
// runs through the blend builder (council S6 — promote populates a draft, never auto-executes).
// Script-safe (no "use server").

export type TrialComponentInput = {
  lotId: string;
  proportion?: number | null;
  volume?: number | null;
  unit?: string | null;
};

export type CreateTrialInput = {
  name: string;
  targetWine?: string | null;
  note?: string | null;
  baseVolume?: number | null;
  baseUnit?: string | null;
  components: TrialComponentInput[];
};

export type ScoreTrialInput = {
  id: string;
  score?: number | null;
  scoreScale?: TastingScoreScale | null;
  readiness?: TastingReadiness | null;
  tastingNotes?: string | null;
};

function validateComponents(components: TrialComponentInput[]): void {
  if (!components || components.length < 2) throw new ActionError("A trial needs at least two components.");
  for (const c of components) {
    if (!c.lotId) throw new ActionError("Each trial component needs a lot.");
    if (c.proportion != null && !(c.proportion > 0 && c.proportion <= 1)) {
      throw new ActionError("A proportion must be between 0 and 1.");
    }
    if (c.volume != null && !(c.volume > 0)) throw new ActionError("A component volume must be greater than 0.");
  }
  const ids = components.map((c) => c.lotId);
  if (new Set(ids).size !== ids.length) throw new ActionError("A lot can appear only once in a trial.");
}

export async function createTrialCore(actor: LedgerActor, input: CreateTrialInput): Promise<{ id: string }> {
  if (!input.name?.trim()) throw new ActionError("Give the trial a name.");
  validateComponents(input.components);
  const trial = await prisma.$transaction(async (tx) => {
    const t = await tx.blendTrial.create({
      data: {
        name: input.name.trim(),
        targetWine: input.targetWine?.trim() || null,
        note: input.note?.trim() || null,
        baseVolume: input.baseVolume ?? null,
        baseUnit: input.baseUnit ?? null,
        enteredById: actor.actorUserId,
        enteredByEmail: actor.actorEmail,
        components: {
          create: input.components.map((c) => ({
            lotId: c.lotId,
            proportion: c.proportion ?? null,
            volume: c.volume ?? null,
            unit: c.unit ?? null,
          })),
        },
      },
      select: { id: true, name: true },
    });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "BlendTrial", entityId: t.id, summary: `Created bench trial "${t.name}"` });
    return t;
  });
  return { id: trial.id };
}

async function loadEditableTrial(id: string) {
  const t = await prisma.blendTrial.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!t) throw new ActionError("That trial no longer exists.");
  if (t.status === "PROMOTED") throw new ActionError("That trial has already been promoted into a blend.");
  if (t.status === "DISCARDED") throw new ActionError("That trial was discarded.");
  return t;
}

export async function updateTrialCore(
  actor: LedgerActor,
  input: CreateTrialInput & { id: string },
): Promise<{ id: string }> {
  const t = await loadEditableTrial(input.id);
  validateComponents(input.components);
  await prisma.$transaction(async (tx) => {
    await tx.blendTrialComponent.deleteMany({ where: { trialId: t.id } });
    await tx.blendTrial.update({
      where: { id: t.id },
      data: {
        name: input.name.trim(),
        targetWine: input.targetWine?.trim() || null,
        note: input.note?.trim() || null,
        baseVolume: input.baseVolume ?? null,
        baseUnit: input.baseUnit ?? null,
        components: {
          create: input.components.map((c) => ({ lotId: c.lotId, proportion: c.proportion ?? null, volume: c.volume ?? null, unit: c.unit ?? null })),
        },
      },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "BlendTrial", entityId: t.id, summary: `Edited bench trial "${input.name.trim()}"` });
  });
  return { id: t.id };
}

export async function scoreTrialCore(actor: LedgerActor, input: ScoreTrialInput): Promise<{ id: string }> {
  const t = await loadEditableTrial(input.id);
  if ((input.score == null) !== (input.scoreScale == null)) {
    throw new ActionError("A score needs a scale (and vice-versa).");
  }
  await prisma.$transaction(async (tx) => {
    await tx.blendTrial.update({
      where: { id: t.id },
      data: { score: input.score ?? null, scoreScale: input.scoreScale ?? null, readiness: input.readiness ?? null, tastingNotes: input.tastingNotes?.trim() || null },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "BlendTrial", entityId: t.id, summary: `Scored bench trial "${t.name}"` });
  });
  return { id: t.id };
}

export async function chooseTrialCore(actor: LedgerActor, input: { id: string }, now: Date): Promise<{ id: string }> {
  const t = await loadEditableTrial(input.id);
  await prisma.$transaction(async (tx) => {
    await tx.blendTrial.update({ where: { id: t.id }, data: { status: "CHOSEN", chosenAt: now } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "BlendTrial", entityId: t.id, summary: `Chose bench trial "${t.name}"` });
  });
  return { id: t.id };
}

export async function discardTrialCore(actor: LedgerActor, input: { id: string }): Promise<{ id: string }> {
  const t = await prisma.blendTrial.findUnique({ where: { id: input.id }, select: { id: true, name: true, status: true } });
  if (!t) throw new ActionError("That trial no longer exists.");
  if (t.status === "PROMOTED") throw new ActionError("A promoted trial can't be discarded — undo the blend instead.");
  await prisma.$transaction(async (tx) => {
    // Discard is zero-ledger-impact: a trial never wrote a ledger row, so just mark it.
    await tx.blendTrial.update({ where: { id: t.id }, data: { status: "DISCARDED" } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "BlendTrial", entityId: t.id, summary: `Discarded bench trial "${t.name}"` });
  });
  return { id: t.id };
}

/** Flip a trial to PROMOTED once its blend has actually been executed (called by the builder). */
export async function markTrialPromotedCore(
  actor: LedgerActor,
  input: { id: string; childLotId: string },
): Promise<{ id: string }> {
  const t = await prisma.blendTrial.findUnique({ where: { id: input.id }, select: { id: true, name: true, status: true } });
  if (!t) throw new ActionError("That trial no longer exists.");
  if (t.status === "PROMOTED") return { id: t.id }; // idempotent
  await prisma.$transaction(async (tx) => {
    await tx.blendTrial.update({ where: { id: t.id }, data: { status: "PROMOTED", promotedToLotId: input.childLotId } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "BlendTrial", entityId: t.id, summary: `Promoted bench trial "${t.name}" into a blend` });
  });
  return { id: t.id };
}
