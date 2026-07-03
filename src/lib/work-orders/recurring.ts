import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createWorkOrderFromTemplateCore } from "@/lib/work-orders/templates";

// Recurring work orders (Phase 9 Unit 15, thin) + a display-only pay-basis attach seam. The cadence math
// is pure (unit-tested); generation is on-demand or by a cron (reuses the reminders cron pattern) — a
// generated instance snaps the CURRENT template version, so recurring never rewrites history. Pay basis
// is DISPLAY-ONLY here: Phase 11 owns all wage math; this returns a placeholder until wage settings exist.

export type RecurringCadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

const CADENCE_DAYS: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14 };

/** The next occurrence after `from` for a cadence (pure). MONTHLY steps a calendar month. */
export function nextOccurrence(cadence: RecurringCadence, from: Date): Date {
  if (cadence === "MONTHLY") {
    const d = new Date(from);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  return new Date(from.getTime() + CADENCE_DAYS[cadence] * 86_400_000);
}

/** Is a recurring template due to spawn its next instance as of `now`? Pure. Never generated → due. */
export function isDueForGeneration(cadence: RecurringCadence, lastGeneratedAt: Date | null, now: Date): boolean {
  if (!lastGeneratedAt) return true;
  return now.getTime() >= nextOccurrence(cadence, lastGeneratedAt).getTime();
}

/** Generate the next DRAFT work order from a recurring template (snaps the current version). The caller
 * (a cron or an on-demand action) decides WHEN via isDueForGeneration; this just spawns the instance. */
export async function generateRecurringInstanceCore(actor: LedgerActor, input: { templateId: string; dueAt?: Date }) {
  const tpl = await prisma.workOrderTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, recurringCadence: true, name: true } });
  if (!tpl) throw new ActionError("That template no longer exists.");
  if (!tpl.recurringCadence) throw new ActionError("That template is not recurring.");
  return createWorkOrderFromTemplateCore(actor, { templateId: tpl.id, dueAt: input.dueAt ?? null });
}

// ── Pay-basis attach seam (display-only; Phase 11 owns wage math) ──

export type PayBasis = { kind: "PIECE_RATE" | "HOURLY"; rate: number; currency: string } | null;

/**
 * Resolve the pay basis to DISPLAY for a task/WO. v1 is a no-op stub — there is no wage-settings table
 * yet (Phase 11). When Phase 11 lands, this reads the piece-rate / hourly rate; until then it returns
 * null so the UI shows nothing. NO wage math happens here (Phase 11 owns it).
 */
export function resolvePayBasisStub(): PayBasis {
  return null;
}
