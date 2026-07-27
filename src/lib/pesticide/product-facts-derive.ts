/**
 * Spray S2b Unit 2 — pure derivation for the CDPR PHI/REI proposal (phases/S2b-cdpr-interval-probe.md
 * §5). No I/O, no DB, no Prisma — `scripts/seed-product-facts.ts --propose` is the only caller.
 *
 * A product typically carries THREE near-duplicate grape site rows (1014/29141/29143 — S2's own
 * `CDPR_GRAPE_SITE_CODES`), and the probe found they do not always agree (0.6-1.4% of products,
 * including physically implausible pairs like a 12-hour and a 7-minute PHI on the same product).
 * Mirrors S2's K13 most-conservative resistance rollup: take the MOST RESTRICTIVE (longest) recorded
 * value across all of a product's grape site rows, and flag a disagreement rather than resolving it
 * silently — a human reviewer looks, this module never guesses which row is right.
 */

export interface GrapeSiteInterval {
  siteCode: number;
  phiDays: number | null;
  reiHours: number | null;
}

export interface RolledUpInterval {
  /** The most restrictive (longest) recorded value, or null if no grape site row recorded one. */
  phiDays: number | null;
  reiHours: number | null;
  /** True when two or more grape site rows recorded DIFFERENT non-null values for this product. */
  phiConflict: boolean;
  reiConflict: boolean;
}

export function rollUpGrapeSiteIntervals(rows: readonly GrapeSiteInterval[]): RolledUpInterval {
  const phiValues = rows.map((r) => r.phiDays).filter((v): v is number => v != null);
  const reiValues = rows.map((r) => r.reiHours).filter((v): v is number => v != null);
  return {
    phiDays: phiValues.length ? Math.max(...phiValues) : null,
    reiHours: reiValues.length ? Math.max(...reiValues) : null,
    phiConflict: new Set(phiValues).size > 1,
    reiConflict: new Set(reiValues).size > 1,
  };
}
