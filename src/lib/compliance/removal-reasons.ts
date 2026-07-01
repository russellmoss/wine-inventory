import { REMOVAL_DISPOSITIONS, type RemovalDisposition } from "./types";

// Unit 4 — the RemovalDisposition enum + human labels ONLY. The disposition→form-line mapping lives
// exclusively in form-map.ts (eng-review E4 — one mapping authority; no second table here).

export { REMOVAL_DISPOSITIONS, type RemovalDisposition } from "./types";

/** Human labels, mirroring the form's own wording (§A/§B line names). */
export const REMOVAL_DISPOSITION_LABELS: Record<RemovalDisposition, string> = {
  TAXPAID: "Removed taxpaid",
  EXPORT: "Removed for export",
  FAMILY_USE: "Removed for family use",
  TESTING: "Used for testing",
  TASTING: "Used for tasting",
  DISTILLING_MATERIAL: "Removed for distilling material",
  VINEGAR: "Removed to vinegar plant",
  SWEETENING: "Used for sweetening",
  SPIRITS: "Used for addition of wine spirits",
  AMELIORATION: "Used for amelioration",
  EFFERVESCENT: "Used for effervescent wine",
};

export const isRemovalDisposition = (v: string): v is RemovalDisposition =>
  (REMOVAL_DISPOSITIONS as readonly string[]).includes(v);
