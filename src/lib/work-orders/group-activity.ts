// Plan 061: a group MAINTENANCE task carries N member vessels in its plannedPayload (mirror of the
// group-rack `groupRack` block), instead of fanning out to one record-only task per barrel. Completion
// writes one VesselActivityEvent per member (WORKORDER-3 preserved per barrel); there is NO ledger op and
// NO approval gate, so unlike group-rack the members live only here — the historical record is the events.
//
// The member set is stored ONLY in JSON (no columns, no join table — same tradeoff group-rack accepted).
// The discriminator everywhere downstream is `parseGroupActivityPayload(plannedPayload) != null`.

export type GroupActivityPayload = {
  /** the maintenance activity subtype (CLEAN/SANITIZE/STEAM/OZONE/GAS/SO2/WET_STORAGE) — mirrors the task's activityType. */
  activityType: string;
  /** resolved, deduped, ordered member vessel ids (authoring sorts + dedups via resolveGroupMembers). */
  memberVesselIds: string[];
  /** display codes parallel to memberVesselIds (for titles/summaries without a DB hit). */
  memberCodes: string[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Parse a task's `plannedPayload.groupActivity` block, or null when the task is a plain single-vessel
 * maintenance task. Fails closed: an empty member set or a missing activityType returns null (never a
 * half-built group), so a caller can't accidentally treat a malformed payload as a group.
 */
export function parseGroupActivityPayload(plannedPayload: unknown): GroupActivityPayload | null {
  const ga = asObject(asObject(plannedPayload).groupActivity);
  const activityType = typeof ga.activityType === "string" && ga.activityType.trim() ? ga.activityType.trim() : null;
  const memberVesselIds = Array.isArray(ga.memberVesselIds)
    ? ga.memberVesselIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const memberCodes = Array.isArray(ga.memberCodes) ? ga.memberCodes.filter((x): x is string => typeof x === "string") : [];
  if (!activityType || memberVesselIds.length === 0) return null;
  return { activityType, memberVesselIds, memberCodes };
}

/**
 * Deterministic completion order for a group's members: deduped + sorted by id. Dedup avoids a
 * `${commandId}:${vesselId}` self-collision if a member id repeats; a stable sort gives a fixed SupplyLot
 * lock order so two concurrent completions on overlapping ranges can't deadlock (they draw the same
 * overhead lot in the same order). Pure — safe to call at authoring and at completion.
 */
export function orderedMemberIds(memberVesselIds: readonly string[]): string[] {
  return [...new Set(memberVesselIds)].sort();
}
