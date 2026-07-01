import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import { resolveVesselLot } from "@/lib/chemistry/resolve-lot";

// Standalone structured tasting notes (Phase 4). NOT a ledger op; undo is a soft-delete.
// Structure sub-scores are 1–5; score is paired with its scale. Mirrors the measurements
// core shape (script-safe, writeAudit, resolve the vessel's lot when no explicit lotId).

export type TastingReadinessKey = "NEEDS_MORE_TIME" | "READY_TO_BLEND" | "READY_TO_BOTTLE" | "HOLD" | "DECLINING";
export type TastingScoreScaleKey = "HUNDRED_POINT" | "TWENTY_POINT";

export type RecordTastingNoteInput = {
  lotId?: string;
  vesselId?: string;
  observedAt?: Date | string;
  appearance?: string;
  aroma?: string;
  flavor?: string;
  tannin?: number | null;
  acidity?: number | null;
  body?: number | null;
  finish?: number | null;
  score?: number | null;
  scoreScale?: TastingScoreScaleKey | null;
  readiness?: TastingReadinessKey | null;
  notes?: string;
  captureMethod?: CaptureMethod;
  clientRequestId?: string;
};

const SCORE_MAX: Record<TastingScoreScaleKey, number> = { HUNDRED_POINT: 100, TWENTY_POINT: 20 };

function structureScore(label: string, v: number | null | undefined): number | null {
  if (v == null) return null;
  if (!Number.isInteger(v) || v < 1 || v > 5) throw new ActionError(`${label} must be a whole number from 1 to 5.`);
  return v;
}

function toDate(d: Date | string | undefined): Date {
  if (d == null) return new Date();
  return typeof d === "string" ? new Date(d) : d;
}

export async function recordTastingNoteCore(
  actor: LedgerActor,
  input: RecordTastingNoteInput,
): Promise<{ tastingNoteId: string; lotId: string }> {
  // Idempotency.
  if (input.clientRequestId) {
    const existing = await prisma.lotTastingNote.findUnique({ where: { clientRequestId: input.clientRequestId } });
    if (existing) return { tastingNoteId: existing.id, lotId: existing.lotId };
  }

  let lotId: string;
  if (input.vesselId) lotId = await resolveVesselLot(input.vesselId, input.lotId);
  else if (input.lotId) lotId = input.lotId;
  else throw new ActionError("A lot or a vessel is required to record a tasting note.");

  const tannin = structureScore("Tannin", input.tannin);
  const acidity = structureScore("Acidity", input.acidity);
  const body = structureScore("Body", input.body);
  const finish = structureScore("Finish", input.finish);

  let score: number | null = null;
  let scoreScale: TastingScoreScaleKey | null = null;
  if (input.score != null) {
    const scale = input.scoreScale ?? "HUNDRED_POINT";
    const max = SCORE_MAX[scale];
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > max) {
      throw new ActionError(`Score must be between 0 and ${max} on the ${scale === "HUNDRED_POINT" ? "100" : "20"}-point scale.`);
    }
    score = Math.round(input.score);
    scoreScale = scale;
  }

  const hasContent =
    [input.appearance, input.aroma, input.flavor, input.notes].some((s) => s && s.trim()) ||
    [tannin, acidity, body, finish, score].some((n) => n != null) ||
    input.readiness != null;
  if (!hasContent) throw new ActionError("Add at least one tasting field (aroma, flavor, a structure score, or notes).");

  const observedAt = toDate(input.observedAt);
  const created = await runInTenantTx(async (tx) => {
    const row = await tx.lotTastingNote.create({
      data: {
        lotId,
        vesselId: input.vesselId ?? null,
        observedAt,
        enteredById: actor.actorUserId,
        enteredByEmail: actor.actorEmail,
        captureMethod: input.captureMethod ?? "MANUAL",
        appearance: input.appearance?.trim() || null,
        aroma: input.aroma?.trim() || null,
        flavor: input.flavor?.trim() || null,
        tannin,
        acidity,
        body,
        finish,
        score,
        scoreScale,
        readiness: input.readiness ?? null,
        notes: input.notes?.trim() || null,
        clientRequestId: input.clientRequestId ?? null,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "LotTastingNote",
      entityId: row.id,
      summary: `Recorded a tasting note${score != null ? ` (${score})` : ""}`,
    });
    return row;
  });
  return { tastingNoteId: created.id, lotId };
}

export async function voidTastingNoteCore(
  actor: LedgerActor,
  input: { tastingNoteId: string },
): Promise<{ tastingNoteId: string }> {
  const note = await prisma.lotTastingNote.findUnique({ where: { id: input.tastingNoteId } });
  if (!note) throw new ActionError("That tasting note no longer exists.");
  if (note.voidedAt) throw new ActionError("That tasting note was already removed.");
  await runInTenantTx(async (tx) => {
    await tx.lotTastingNote.update({
      where: { id: input.tastingNoteId },
      data: { voidedAt: new Date(), voidedById: actor.actorUserId },
    });
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "LotTastingNote",
      entityId: input.tastingNoteId,
      summary: `Removed a tasting note`,
    });
  });
  return { tastingNoteId: input.tastingNoteId };
}
