// Phase 8 (Unit 2/9) — the per-tenant costing POLICY: pure, no DB/server imports so it is unit-tested
// directly (like ledger-math / lineage). Two jobs: (1) the CostSettings shape + defaults the data layer
// hydrates, and (2) the capitalization resolver the roll-up engine (Unit 4) and the settings UI (Unit 9)
// both consult so "which components fold into capitalized cost" has ONE authority.

import type { CostComponent, CostingMethod } from "@prisma/client";

export type CostSettings = {
  currency: string;
  costingMethod: CostingMethod;
  costingMethodEffectiveAt: Date | null;
  capitalizeFruit: boolean;
  capitalizeBarrel: boolean;
  capitalizeLabor: boolean;
  capitalizeOverhead: boolean;
  capitalizePackaging: boolean;
  /** costingPolicyVersion — stamped on every derived cost row so a later toggle/method change never
   * re-values closed history (D17). */
  policyVersion: number;
};

// Defaults mirror the schema column defaults (used before the settings row exists): weighted-average,
// USD, MATERIAL + FRUIT + BARREL + PACKAGING capitalized, LABOR + OVERHEAD recorded-but-not-capitalized
// (allocation is Phase 11 — D8).
export const COST_SETTINGS_DEFAULTS: CostSettings = {
  currency: "USD",
  costingMethod: "WEIGHTED_AVG",
  costingMethodEffectiveAt: null,
  capitalizeFruit: true,
  capitalizeBarrel: true,
  capitalizeLabor: false,
  capitalizeOverhead: false,
  capitalizePackaging: true,
  policyVersion: 1,
};

/**
 * Does this cost component fold into the lot's CAPITALIZED cost under the tenant's policy? (D5)
 * MATERIAL, DOSAGE_LIQUEUR, OPENING_BALANCE, and VARIANCE always capitalize (VARIANCE here is a reconciliation of
 * already-capitalized cost — the abnormal-loss WRITE-OFF is modeled as an expense line the roll-up
 * excludes at attach time, not gated here). The rest are toggle-gated: a component that is toggled
 * OFF is still RECORDED as a CostLine, it just does not roll into cost-per-bottle (D9/Unit 9).
 */
export function isComponentCapitalized(component: CostComponent, s: CostSettings): boolean {
  switch (component) {
    case "MATERIAL":
    case "DOSAGE_LIQUEUR":
    case "OPENING_BALANCE":
    case "VARIANCE":
      return true;
    case "FRUIT":
      return s.capitalizeFruit;
    case "BARREL":
      return s.capitalizeBarrel;
    case "LABOR":
      return s.capitalizeLabor;
    case "OVERHEAD":
      return s.capitalizeOverhead;
    case "PACKAGING":
      return s.capitalizePackaging;
    default:
      return true;
  }
}

/**
 * The costing METHOD in effect as of an op's observedAt (D17 contract pin). With a single current
 * method + effective date (v1), an op at or after the effective date uses the current method; an op
 * BEFORE it predates the switch and falls back to the historical default (WEIGHTED_AVG). Consumption
 * rows stamp this at write time so recompute stays stable when the setting later changes.
 */
export function resolveMethodAt(s: CostSettings, observedAt: Date): CostingMethod {
  if (!s.costingMethodEffectiveAt) return s.costingMethod;
  return observedAt >= s.costingMethodEffectiveAt ? s.costingMethod : "WEIGHTED_AVG";
}
