/**
 * Vineyard Intelligence P4 — soil snapshot shapes + Zod validation.
 *
 * PURE: no I/O. The `components` column is validated ON READ (`parseStoredComponents`) so an
 * older/unreadable snapshot DEGRADES to a badge + re-pull rather than 500ing the block page
 * (design §Storage). Every property is one NRCS publishes, cited to a `mukey` at the level NRCS
 * publishes it — `*Basis` names that level. We invent NO property value; area % is the only
 * aggregate we compute (design "Key Insight" — no block-level blended pH/drainage/AWC/depth).
 */
import { z } from "zod";

/** Coverage-class of a map unit. `mixed` = a real soil whose major set also carries a misc/water
 *  component (keep its soil properties, don't suppress — council C9). `uncovered`/`other` are synthetic. */
export const SOIL_CLASSES = ["soil", "water", "non-soil", "mixed", "uncovered", "other"] as const;
export type SoilClass = (typeof SOIL_CLASSES)[number];

/** Overall coverage state (String union, not a DB enum — Windows enum-ordering trap). */
export const COVERAGE_STATES = ["covered", "partial", "over", "none"] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

/** One map unit (or the synthetic `uncovered`/`other` row). `belowFloor` marks sub-share slivers
 *  the UI groups under "Other" — but the mukey + properties STAY in the JSON (council C8). */
export const SoilComponentSchema = z.object({
  mukey: z.string(),
  // OPTIONAL + defaulted so a snapshot written before musym existed still parses (degrade-on-read, not 500).
  musym: z.string().nullable().optional().default(null),
  muname: z.string(),
  class: z.enum(SOIL_CLASSES),
  areaPct: z.number(), // normalized share in [0,1]
  areaSqM: z.number(), // areaPct × geodesic block area (local) — never a cos(lat)-scaled SDA value
  comppct: z.number().nullable(), // major-component percentage
  drainageClass: z.string().nullable(),
  drainageBasis: z.string().nullable(),
  awc: z.number().nullable(),
  awcUnit: z.string().nullable(),
  ph: z.number().nullable(),
  phBasis: z.string().nullable(),
  restrictiveDepthCm: z.number().nullable(),
  belowFloor: z.boolean(),
});
export type SoilComponent = z.infer<typeof SoilComponentSchema>;

/** The stored `components` column. Versioned/validated on read. */
export const SoilComponentsSchema = z.array(SoilComponentSchema);

/** The pure core's output for one block. `blockAreaSqM` is filled by the orchestrator (geodesic). */
export type SoilComposition = {
  coveredPct: number;
  coverageState: CoverageState;
  components: SoilComponent[];
  surveyAreaSymbol: string | null;
  surveyAreaVersion: string | null;
};

/**
 * Validate a stored `components` value on read. Returns null (NEVER throws) on any shape mismatch so
 * the block page degrades to an "unreadable snapshot — re-pull" badge instead of crashing.
 */
export function parseStoredComponents(value: unknown): SoilComponent[] | null {
  const r = SoilComponentsSchema.safeParse(value);
  return r.success ? r.data : null;
}
