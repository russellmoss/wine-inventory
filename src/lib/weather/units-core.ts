// Plan 096 Phase 0 Unit 3 — the unit-conversion surface for everything the grower sees in the
// weather section. Plan 098 promoted the single-owner pattern app-wide: the implementation now
// lives in `src/lib/units/display.ts` (volumes, weights and lengths aren't "weather"), and this
// file re-exports the weather family so every existing import stays valid. The rule is unchanged
// and still enforced there: no other file may hold an inline `× 1.8`, `/ 25.4`, or `× 9/5`.

export {
  cToF,
  fToC,
  formatGdd,
  formatPrecip,
  formatSpeed,
  formatTemp,
  gddCToF,
  gddFToC,
  kphToMph,
  mmToInches,
  normalizeUnitSystem,
} from "@/lib/units/display";
export type { UnitSystem } from "@/lib/units/display";
