import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runInTenantTx } from "@/lib/tenant/tx";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { WINE_TAX_CLASSES, type WineTaxClass } from "./types";
import { resolveClassesForLots } from "./generate";

// Phase 2 (TAXCLASS-1) — a dated, append-only Change-Of-Tax-Class event. Tax class stays DERIVED
// (never a stored Lot column); this event is the point-in-time OVERRIDE a winemaker records to
// intentionally declare/correct a class (a premature declaration fix, a hand-set class, a cross-class
// blend's intended class). It carries NO volume, so it is NOT a ledger op — a zero-volume ledger line
// would violate LEDGER-2. Instead `volumeAtEvent` snapshots the lot's on-hand liters as-of the event
// (self-describing + auditable), and the 5120.17 fold posts §A24 (out of the old class) / §A10 (into
// the new class) from it. `resolveClassesForLots` reads the latest in-scope event before ABV fallback.
//
// A no-op / idempotent assignment (toClass == the class already in effect) emits NOTHING (council
// Codex-CRIT4). Not a ledger op ⇒ no runLedgerWrite; the create + audit run in one runInTenantTx.

export type ChangeTaxClassInput = {
  lotId: string;
  toClass: WineTaxClass;
  observedAt?: Date;
  reason?: string | null;
  commandId?: string | null;
};

export type ChangeTaxClassResult = {
  eventId: string | null;
  lotId: string;
  fromClass: WineTaxClass | null;
  toClass: WineTaxClass;
  volumeAtEvent: number;
  noop: boolean;
  duplicate: boolean;
  message: string;
};

export type RecordTaxClassEventTxInput = {
  lotId: string;
  lotCode?: string | null;
  fromClass: WineTaxClass | null;
  toClass: WineTaxClass;
  volumeAtEvent: number;
  observedAt: Date;
  reason?: string | null;
  commandId?: string | null;
};

function isCommandConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

async function findByCommandId(commandId: string): Promise<ChangeTaxClassResult | null> {
  const ev = await prisma.changeOfTaxClassEvent.findFirst({
    where: { commandId },
    select: { id: true, lotId: true, fromClass: true, toClass: true, volumeAtEvent: true },
  });
  if (!ev) return null;
  return {
    eventId: ev.id,
    lotId: ev.lotId,
    fromClass: (ev.fromClass as WineTaxClass | null) ?? null,
    toClass: ev.toClass as WineTaxClass,
    volumeAtEvent: Number(ev.volumeAtEvent ?? 0),
    noop: false,
    duplicate: true,
    message: `Tax-class change already recorded (event ${ev.id}).`,
  };
}

/** The lot's on-hand VESSEL liters as-of `asOf` (point-in-time; stamped onto the event row). */
async function onHandAsOf(lotId: string, asOf: Date): Promise<number> {
  const lines = await prisma.lotOperationLine.findMany({
    where: { lotId, bucket: "VESSEL", operation: { observedAt: { lte: asOf } } },
    select: { deltaL: true },
  });
  return round2(lines.reduce((a, l) => a + Number(l.deltaL), 0));
}

export async function recordTaxClassEventTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: RecordTaxClassEventTxInput,
): Promise<ChangeTaxClassResult> {
  if (input.fromClass === input.toClass) {
    return {
      eventId: null,
      lotId: input.lotId,
      fromClass: input.fromClass,
      toClass: input.toClass,
      volumeAtEvent: 0,
      noop: true,
      duplicate: false,
      message: `${input.lotCode ?? input.lotId} is already class ${input.toClass} - no change recorded.`,
    };
  }
  const created = await tx.changeOfTaxClassEvent.create({
    data: {
      lotId: input.lotId,
      fromClass: input.fromClass,
      toClass: input.toClass,
      volumeAtEvent: input.volumeAtEvent,
      observedAt: input.observedAt,
      actor: actor.actorEmail,
      reason: input.reason?.trim() || null,
      commandId: input.commandId ?? null,
    },
    select: { id: true },
  });
  await writeAudit(tx, {
    ...actor,
    action: "UPDATE",
    entityType: "ChangeOfTaxClassEvent",
    entityId: created.id,
    summary: `Tax class of ${input.lotCode ?? input.lotId}: ${input.fromClass ?? "-"} -> ${input.toClass} (${input.volumeAtEvent} L)`,
  });
  return {
    eventId: created.id,
    lotId: input.lotId,
    fromClass: input.fromClass,
    toClass: input.toClass,
    volumeAtEvent: input.volumeAtEvent,
    noop: false,
    duplicate: false,
    message: `Recorded ${input.lotCode ?? input.lotId} as tax class ${input.toClass} (was ${input.fromClass ?? "undeclared"}).`,
  };
}

/**
 * Record a Change-Of-Tax-Class event (append-only). `fromClass` is the class in effect just before
 * the event (resolved point-in-time); `toClass` is the declared class. A no-op (toClass already in
 * effect) writes nothing. commandId gives double-submit idempotency (a duplicate is a no-op success).
 */
export async function changeTaxClassCore(actor: LedgerActor, input: ChangeTaxClassInput): Promise<ChangeTaxClassResult> {
  if (!input.lotId) throw new ActionError("Pick a lot.");
  const toClass = input.toClass;
  if (!(WINE_TAX_CLASSES as readonly string[]).includes(toClass)) {
    throw new ActionError("Unknown tax class.");
  }
  const observedAt = input.observedAt ?? new Date();

  if (input.commandId) {
    const existing = await findByCommandId(input.commandId);
    if (existing) return existing;
  }

  const lot = await prisma.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true } });
  if (!lot) throw new ActionError("That lot doesn't exist in this winery.", "CONFLICT");

  // fromClass = the class in effect just before this event (latest prior event, else ABV derivation).
  const priorClasses = await resolveClassesForLots([input.lotId], observedAt, {});
  const fromClass = priorClasses.get(input.lotId)?.taxClass ?? null;

  // No-op / idempotent assignment emits nothing (council Codex-CRIT4).
  if (fromClass === toClass) {
    return {
      eventId: null,
      lotId: input.lotId,
      fromClass,
      toClass,
      volumeAtEvent: 0,
      noop: true,
      duplicate: false,
      message: `${lot.code} is already class ${toClass} — no change recorded.`,
    };
  }

  const volumeAtEvent = await onHandAsOf(input.lotId, observedAt);

  try {
    const eventId = await runInTenantTx(async (tx) => {
      const created = await tx.changeOfTaxClassEvent.create({
        data: {
          lotId: input.lotId,
          fromClass,
          toClass,
          volumeAtEvent,
          observedAt,
          actor: actor.actorEmail,
          reason: input.reason?.trim() || null,
          commandId: input.commandId ?? null,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "ChangeOfTaxClassEvent",
        entityId: created.id,
        summary: `Tax class of ${lot.code}: ${fromClass ?? "—"} → ${toClass} (${volumeAtEvent} L)`,
      });
      return created.id;
    });
    return {
      eventId,
      lotId: input.lotId,
      fromClass,
      toClass,
      volumeAtEvent,
      noop: false,
      duplicate: false,
      message: `Recorded ${lot.code} as tax class ${toClass} (was ${fromClass ?? "undeclared"}).`,
    };
  } catch (e) {
    if (input.commandId && isCommandConflict(e)) {
      const existing = await findByCommandId(input.commandId);
      if (existing) return existing;
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ActionError("A tax-class change with that command id already exists.", "CONFLICT");
    }
    throw e;
  }
}
