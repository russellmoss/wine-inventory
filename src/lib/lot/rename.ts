import type { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { disambiguate } from "@/lib/lot/code";
import { setCurrentCodeTx } from "@/lib/lot/identify";

// Phase 1 (identity presentation) — the append-only rename cores (plan C2, NAMING-2). A rename
// appends a LotCodeEvent (the single source of truth for rename history, plan Q13) and updates
// Lot.code / Lot.displayName. It NEVER touches a LotOperationLine snapshot. On a `code` collision it
// OFFERS disambiguation (throws CodeCollisionError with a suggestion) — never silently applies it
// (NAMING-1). `commandId` (unique per tenant) makes a double-submit a no-op.

export type LotRenameActor = { actorUserId: string | null; actorEmail: string };

/** A `code` rename hit the per-tenant uniqueness constraint. The system OFFERS `suggestion`; it does
 *  NOT silently apply it (NAMING-1). The caller presents the choice and re-invokes with the chosen code. */
export class CodeCollisionError extends Error {
  readonly attemptedCode: string;
  readonly suggestion: string;
  readonly conflictLotId: string;
  constructor(attemptedCode: string, suggestion: string, conflictLotId: string) {
    super(`Lot code "${attemptedCode}" is already used in this winery.`);
    this.name = "CodeCollisionError";
    this.attemptedCode = attemptedCode;
    this.suggestion = suggestion;
    this.conflictLotId = conflictLotId;
  }
}

// Control chars (C0 range + DEL) and zero-width / BOM characters — stripped from a displayName so a
// fat-fingered or malicious value can't break reports/grids (council G6). Built from an escape string
// (never literal control chars) so the source stays clean.
const CTRL_AND_ZERO_WIDTH_RE = new RegExp("[\\u0000-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]", "g");
const MAX_DISPLAY_NAME = 60;

/** Canonicalize a displayName (council G6): trim, strip control/zero-width, cap length, ""->null. */
export function canonicalizeDisplayName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(CTRL_AND_ZERO_WIDTH_RE, "").trim().slice(0, MAX_DISPLAY_NAME);
  return cleaned.length === 0 ? null : cleaned;
}

/** True if a prior rename already recorded this commandId (idempotent replay guard). */
async function alreadyApplied(tx: Prisma.TransactionClient, commandId: string): Promise<boolean> {
  const prior = await tx.lotCodeEvent.findFirst({ where: { commandId }, select: { id: true } });
  return prior != null;
}

/**
 * Rename a lot's human `code`. Appends a LotCodeEvent, updates Lot.code + the current-code identifier,
 * NEVER a line snapshot. On collision: throws CodeCollisionError (the offer) unless `acceptSuggestion`
 * (then the pre-computed suggestion is applied). Idempotent on `commandId`.
 */
export async function renameLotCore(input: {
  lotId: string;
  newCode: string;
  actor: LotRenameActor;
  commandId: string;
  acceptSuggestion?: boolean;
}): Promise<{ code: string; renamed: boolean }> {
  const newCodeTrimmed = input.newCode.trim();
  if (!newCodeTrimmed) throw new Error("A lot code cannot be empty.");

  return runInTenantTx(async (tx) => {
    if (await alreadyApplied(tx, input.commandId)) {
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: input.lotId }, select: { code: true } });
      return { code: lot.code, renamed: false };
    }
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: input.lotId }, select: { code: true } });
    if (lot.code === newCodeTrimmed) return { code: lot.code, renamed: false };

    let target = newCodeTrimmed;
    const conflict = await tx.lot.findFirst({
      where: { code: newCodeTrimmed, NOT: { id: input.lotId } },
      select: { id: true },
    });
    if (conflict) {
      const siblings = await tx.lot.findMany({
        where: { code: { startsWith: newCodeTrimmed } },
        select: { code: true },
      });
      const suggestion = disambiguate(newCodeTrimmed, new Set(siblings.map((s) => s.code)));
      if (!input.acceptSuggestion) {
        throw new CodeCollisionError(newCodeTrimmed, suggestion, conflict.id);
      }
      target = suggestion; // operator accepted the offer
    }

    await tx.lotCodeEvent.create({
      data: {
        lotId: input.lotId,
        field: "code",
        fromValue: lot.code,
        toValue: target,
        actorUserId: input.actor.actorUserId,
        actorEmail: input.actor.actorEmail,
        commandId: input.commandId,
      },
    });
    await tx.lot.update({ where: { id: input.lotId }, data: { code: target } });
    await setCurrentCodeTx(tx, input.lotId, target);
    await writeAudit(tx, {
      actorUserId: input.actor.actorUserId,
      actorEmail: input.actor.actorEmail,
      action: "UPDATE",
      entityType: "Lot",
      entityId: input.lotId,
      changes: { code: { from: lot.code, to: target } },
      summary: `Renamed lot code ${lot.code} -> ${target}`,
    });
    return { code: target, renamed: true };
  });
}

/**
 * Set (or clear) a lot's NON-unique displayName. Appends a LotCodeEvent (field=displayName), updates
 * Lot.displayName. Duplicates are accepted (no collision path). Canonicalizes the input. Idempotent.
 */
export async function setDisplayNameCore(input: {
  lotId: string;
  displayName: string | null;
  actor: LotRenameActor;
  commandId: string;
}): Promise<{ displayName: string | null }> {
  const next = canonicalizeDisplayName(input.displayName);
  return runInTenantTx(async (tx) => {
    if (await alreadyApplied(tx, input.commandId)) {
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: input.lotId }, select: { displayName: true } });
      return { displayName: lot.displayName ?? null };
    }
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: input.lotId }, select: { displayName: true } });
    const prev = lot.displayName ?? null;
    if (prev === next) return { displayName: prev };

    await tx.lotCodeEvent.create({
      data: {
        lotId: input.lotId,
        field: "displayName",
        fromValue: prev,
        toValue: next ?? "", // toValue is NOT NULL; "" encodes a cleared displayName
        actorUserId: input.actor.actorUserId,
        actorEmail: input.actor.actorEmail,
        commandId: input.commandId,
      },
    });
    await tx.lot.update({ where: { id: input.lotId }, data: { displayName: next } });
    await writeAudit(tx, {
      actorUserId: input.actor.actorUserId,
      actorEmail: input.actor.actorEmail,
      action: "UPDATE",
      entityType: "Lot",
      entityId: input.lotId,
      changes: { displayName: { from: prev, to: next } },
      summary: `Set lot display name ${next ? `-> "${next}"` : "(cleared)"}`,
    });
    return { displayName: next };
  });
}

/**
 * Swap two lots' codes (council G1 — mislabeled tanks). The per-tenant unique on `code` is not
 * DEFERRABLE, so the swap routes through an internal temporary sentinel in one tx, but records exactly
 * TWO clean LotCodeEvents (A->B, B->A) — no `TMP` garbage in the audit log. Idempotent on commandId.
 */
export async function swapLotCodes(input: {
  lotIdA: string;
  lotIdB: string;
  actor: LotRenameActor;
  commandId: string;
}): Promise<{ codeA: string; codeB: string }> {
  const cmdA = `${input.commandId}:a`;
  const cmdB = `${input.commandId}:b`;
  return runInTenantTx(async (tx) => {
    if (await alreadyApplied(tx, cmdA)) {
      const a = await tx.lot.findUniqueOrThrow({ where: { id: input.lotIdA }, select: { code: true } });
      const b = await tx.lot.findUniqueOrThrow({ where: { id: input.lotIdB }, select: { code: true } });
      return { codeA: a.code, codeB: b.code };
    }
    const a = await tx.lot.findUniqueOrThrow({ where: { id: input.lotIdA }, select: { code: true } });
    const b = await tx.lot.findUniqueOrThrow({ where: { id: input.lotIdB }, select: { code: true } });
    if (a.code === b.code) throw new Error("Both lots already share this code.");

    const temp = `__swap__${input.commandId}`;
    // A -> temp -> (B takes A's old code) -> (A takes B's old code). Never violates the unique.
    await tx.lot.update({ where: { id: input.lotIdA }, data: { code: temp } });
    await tx.lot.update({ where: { id: input.lotIdB }, data: { code: a.code } });
    await tx.lot.update({ where: { id: input.lotIdA }, data: { code: b.code } });

    await tx.lotCodeEvent.create({
      data: {
        lotId: input.lotIdA, field: "code", fromValue: a.code, toValue: b.code,
        actorUserId: input.actor.actorUserId, actorEmail: input.actor.actorEmail, commandId: cmdA,
      },
    });
    await tx.lotCodeEvent.create({
      data: {
        lotId: input.lotIdB, field: "code", fromValue: b.code, toValue: a.code,
        actorUserId: input.actor.actorUserId, actorEmail: input.actor.actorEmail, commandId: cmdB,
      },
    });
    await setCurrentCodeTx(tx, input.lotIdA, b.code);
    await setCurrentCodeTx(tx, input.lotIdB, a.code);
    await writeAudit(tx, {
      actorUserId: input.actor.actorUserId,
      actorEmail: input.actor.actorEmail,
      action: "UPDATE",
      entityType: "Lot",
      entityId: input.lotIdA,
      changes: { code: { from: a.code, to: b.code } },
      summary: `Swapped lot codes ${a.code} <-> ${b.code}`,
    });
    return { codeA: b.code, codeB: a.code };
  });
}
