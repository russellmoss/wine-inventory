// Plan 106 / M1 — the boundary that keeps KEG and BIN out of the barrel/tank surfaces.
//
// RFC-000 §2 lists this as the ENFORCE step for `VesselType += KEG (+BIN)`: "Picker + capacity call
// sites must filter on `type`." Adding the two enum values widened Prisma's `VesselType` union, and
// three cellar surfaces declare their row DTO as the literal `"BARREL" | "TANK"` — so the widening
// broke `tsc` in exactly the places that would have rendered a keg as a tank.
//
// Nothing writes KEG or BIN until Phase 8 (RFC-002), so today this filters an empty set. It is
// deliberately landed WITH the enum values rather than later: the moment Phase 8 creates the first
// keg, these surfaces must already be excluding it. A cast would have silenced the type error while
// leaving that hole open — the point of a predicate over a cast is that the exclusion is real.
//
// This is NOT a claim that kegs are second-class. It is a claim that the vessel list, the tank/barrel
// board and the bottling source picker are about bulk cellar vessels. A keg surface is Phase 8's job.
import type { VesselType } from "@prisma/client";

/** The vessel types the bulk-cellar surfaces are about. Kegs/bins are Phase 8 and are excluded. */
export const CELLAR_VESSEL_TYPES = ["BARREL", "TANK"] as const;

export type CellarVesselType = (typeof CELLAR_VESSEL_TYPES)[number];

/** Mutable copy for Prisma's `in` filter, which will not accept a readonly tuple. */
export const CELLAR_VESSEL_TYPE_FILTER: VesselType[] = [...CELLAR_VESSEL_TYPES];

/**
 * Narrow a fetched vessel row to a bulk-cellar vessel.
 *
 * Pair it with `where: { type: { in: CELLAR_VESSEL_TYPE_FILTER } }` on the query. The `where` clause
 * does the real exclusion (and keeps the row count honest); this predicate is what lets TypeScript
 * see it, because Prisma types `type` as the full enum regardless of the filter.
 */
export function isCellarVessel<T extends { type: VesselType }>(v: T): v is T & { type: CellarVesselType } {
  return v.type === "BARREL" || v.type === "TANK";
}
