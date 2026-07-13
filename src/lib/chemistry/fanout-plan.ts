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
