// Plan 060: pure fan-out planning for a whole-tank reading. DB-free so it is unit-tested without
// a database (mirrors resolveResidentLot in resolve-lot.ts). Given the resident lots of a vessel and
// a STABLE base key (the capture's clientRequestId), it produces a deterministic group id + one
// per-lot idempotency key. Deterministic is the whole point: a retry / offline re-sync with the same
// base lands the SAME group and per-lot keys, so the (tenantId, vesselReadingGroupId, lotId) unique
// makes each per-lot write a no-op on replay instead of a duplicate.

export type FanoutPlan = {
  vesselReadingGroupId: string;
  perLot: { lotId: string; clientRequestId: string }[];
};

/**
 * Deterministic group id + per-lot idempotency keys from a stable base + resident lot ids.
 * Group id = `vrg:${base}`; each lot's panel key = `${groupId}#${lotId}` (cuid/uuid ids and lot ids
 * never contain `#`, so the delimiter is safe). Same (residents, base) → byte-identical plan.
 */
export function planVesselReadingFanout(residentLotIds: string[], baseClientRequestId: string): FanoutPlan {
  const vesselReadingGroupId = `vrg:${baseClientRequestId}`;
  return {
    vesselReadingGroupId,
    perLot: residentLotIds.map((lotId) => ({ lotId, clientRequestId: `${vesselReadingGroupId}#${lotId}` })),
  };
}

/**
 * The "physical reading" id for VESSEL-scoped dedup: the N fanned-out panels of one whole-tank
 * reading share their group id, so coalesce(vesselReadingGroupId, id) collapses them to one; an
 * ungrouped (legacy / single-lot) panel is its own. Used ONLY by vessel-scoped views (vessel History,
 * /bulk trends, panel counts). LOT-scoped views must NOT dedup — each lot keeps its own panel/curve.
 */
export function physicalReadingKey(p: { id: string; vesselReadingGroupId: string | null }): string {
  return p.vesselReadingGroupId ?? p.id;
}

/** Keep one representative row per physical reading (first wins). Vessel-scoped only (see above). */
export function dedupeByPhysicalReading<T extends { id: string; vesselReadingGroupId: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = physicalReadingKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
