// Phase 9.1 (Unit 2): controlled vocabularies for the work-order Filtration + Rack task types. These are
// client-safe consts (no server imports) so the template picker + execute renderer can import them. The
// filter medium maps onto the existing free-text `LotTreatment.medium` column (D4 — no migration, validated
// at the seam); the rack type maps onto the RACK op note/reason.

/** Real cellar filtration equipment (operator decision 1). Selected value is stored as LotTreatment.medium. */
export const FILTER_MEDIA = [
  "Pad/Sheet",
  "Lenticular (Depth)",
  "Cross-flow",
  "Membrane",
  "DE",
  "Rotary Vacuum (Lees)",
  "RO",
] as const;
export type FilterMedium = (typeof FILTER_MEDIA)[number];

export function isFilterMedium(v: unknown): v is FilterMedium {
  return typeof v === "string" && (FILTER_MEDIA as readonly string[]).includes(v);
}

/** Optional rack descriptor (operator decision 4a). Mapped onto the RACK op note. */
export const RACK_TYPES = ["off gross lees", "off fine lees", "clean-to-clean", "délestage"] as const;
export type RackType = (typeof RACK_TYPES)[number];

export function isRackType(v: unknown): v is RackType {
  return typeof v === "string" && (RACK_TYPES as readonly string[]).includes(v);
}
