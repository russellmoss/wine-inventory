import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";

// Vessel → resident-lot resolution for capture-time records (VISION D2: a measurement
// belongs to exactly ONE homogeneous lot). If a vessel holds exactly one lot we auto-attach;
// if it holds more than one the caller MUST pass an explicit lotId (the UI shows a picker).
// Sample RESULTS do NOT use this — they inherit the sample's captured lotId, never re-resolved.
//
// The decision is a pure function over the resident lot ids so it is unit-tested without a DB;
// the DB wrapper just reads the current projection and maps the outcome to a typed error.

export type ResolveOutcome =
  | { ok: true; lotId: string }
  | { ok: false; reason: "empty" | "not_resident" };

/**
 * Decide which lot a record attaches to. A vessel holds ONE cohesive liquid (LEDGER-12), so
 * naming a vessel names its wine: 0 residents → empty; otherwise that lot. An explicit pick is
 * still honoured and still has to be a resident — that path is how a caller pins a lot BY CODE.
 *
 * The `"ambiguous"` outcome is gone with plan 088. It existed to make the caller ask "which lot?",
 * a question with no physical answer, and it was the root of every picker in the app.
 */
export function resolveResidentLot(residentLotIds: string[], explicitLotId?: string | null): ResolveOutcome {
  const residents = residentLotIds;
  if (residents.length === 0) return { ok: false, reason: "empty" };
  if (explicitLotId) {
    return residents.includes(explicitLotId)
      ? { ok: true, lotId: explicitLotId }
      : { ok: false, reason: "not_resident" };
  }
  // listResidentLots orders by volume desc, so a legacy row that predates the invariant still
  // resolves to the wine that is actually in the vessel rather than refusing the reading.
  return { ok: true, lotId: residents[0] };
}

export type ResidentLot = { lotId: string; code: string; varietyName: string | null };

/** Read the lots currently resident in a vessel (for a picker / auto-resolution). */
export async function listResidentLots(vesselId: string): Promise<ResidentLot[]> {
  const rows = await prisma.vesselLot.findMany({
    where: { vesselId },
    orderBy: { volumeL: "desc" },
    include: { lot: { select: { code: true, originVarietyId: true } } },
  });
  const varietyIds = [...new Set(rows.map((r) => r.lot.originVarietyId).filter((x): x is string => !!x))];
  const varieties = varietyIds.length
    ? await prisma.variety.findMany({ where: { id: { in: varietyIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(varieties.map((v) => [v.id, v.name]));
  return rows.map((r) => ({
    lotId: r.lotId,
    code: r.lot.code,
    varietyName: r.lot.originVarietyId ? nameById.get(r.lot.originVarietyId) ?? null : null,
  }));
}

/**
 * Resolve a vessel's lot for a capture record, throwing a typed ActionError the UI maps to
 * a picker / empty-state. Pass `explicitLotId` from a multi-resident form's lot select.
 */
export async function resolveVesselLot(vesselId: string, explicitLotId?: string | null): Promise<string> {
  const residents = await prisma.vesselLot.findMany({ where: { vesselId }, select: { lotId: true } });
  const outcome = resolveResidentLot(residents.map((r) => r.lotId), explicitLotId);
  if (outcome.ok) return outcome.lotId;
  switch (outcome.reason) {
    case "empty":
      throw new ActionError("That vessel is empty — there's no lot to attach the record to.");
    case "not_resident":
      throw new ActionError("The chosen lot isn't in that vessel.");
  }
}
