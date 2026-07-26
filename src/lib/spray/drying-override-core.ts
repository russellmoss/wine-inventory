// Spray Intelligence S3a — the attributed drying override + the derived recompute (KD-2).
// The override NEVER mutates the block line: it appends a spray_drying_override row (its own
// append-only table, trigger-allowlists nothing). The DERIVED columns on the block line are the
// only recomputable ones (allowlisted in the trigger) and carry their own basis + timestamp.

import "server-only";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import {
  deriveDriedBeforeRain,
  NullPrecipitationSeriesPort,
  type PrecipitationSeriesPort,
  DEFAULT_REQUIRED_DRYING_MINUTES,
} from "./drying-core";
import type { SprayActor } from "./types";

/** Append an attributed operator override (council S3). History is retained; latest wins at read. */
export async function recordDryingOverrideCore(
  actor: SprayActor,
  input: { blockLineId: string; value: boolean; reason: string; observedAt: Date },
) {
  if (!input.reason?.trim()) throw new Error("A drying override requires a reason.");
  return runInTenantTx(async (tx) => {
    const blockLine = await tx.sprayBlockLine.findUnique({ where: { id: input.blockLineId }, select: { id: true, blockLabelSnapshot: true } });
    if (!blockLine) throw new Error(`Spray block line ${input.blockLineId} not found in this tenant.`);
    const override = await tx.sprayDryingOverride.create({
      data: {
        blockLineId: input.blockLineId,
        value: input.value,
        reason: input.reason,
        observedAt: input.observedAt,
        enteredById: actor.userId,
        enteredByEmail: actor.email,
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "CREATE",
      entityType: "spray_drying_override",
      entityId: override.id,
      summary: `Drying override on block ${blockLine.blockLabelSnapshot}: driedBeforeRain=${input.value} (${input.reason}).`,
    });
    return override;
  });
}

/**
 * Recompute the DERIVED driedBeforeRain columns for one block line through the injected
 * precipitation port (S1 implements it later; the null port yields null + INSUFFICIENT_DATA —
 * the honest S3a default). Only the three allowlisted derived columns are written (KD-2).
 */
export async function recomputeDriedBeforeRainCore(
  blockLineId: string,
  deps?: { precipPort?: PrecipitationSeriesPort; requiredDryingMinutes?: number },
) {
  const port = deps?.precipPort ?? NullPrecipitationSeriesPort;
  const requiredDryingMinutes = deps?.requiredDryingMinutes ?? DEFAULT_REQUIRED_DRYING_MINUTES;
  return runInTenantTx(async (tx) => {
    const blockLine = await tx.sprayBlockLine.findUnique({ where: { id: blockLineId }, select: { id: true, finishedAt: true } });
    if (!blockLine) throw new Error(`Spray block line ${blockLineId} not found in this tenant.`);
    const series = blockLine.finishedAt
      ? await port.hourlyPrecipMm({
          start: blockLine.finishedAt,
          end: new Date(blockLine.finishedAt.getTime() + requiredDryingMinutes * 60_000),
        })
      : null;
    const derived = deriveDriedBeforeRain({ finishedAt: blockLine.finishedAt, requiredDryingMinutes, hourlyPrecip: series });
    return tx.sprayBlockLine.update({
      where: { id: blockLineId },
      data: {
        driedBeforeRainDerived: derived.value,
        driedBeforeRainBasis: derived.basis,
        driedBeforeRainDerivedAt: new Date(),
      },
      select: { id: true, driedBeforeRainDerived: true, driedBeforeRainBasis: true, driedBeforeRainDerivedAt: true },
    });
  });
}
