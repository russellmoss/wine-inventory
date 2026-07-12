// Plan 053 B9: the allowed Location classifications. Validated string (no Prisma enum). Single source of
// truth for the admin location editor + any guard; nullable/unclassified is always allowed.

export const LOCATION_KINDS = ["cellar", "warehouse", "crush_pad", "lab", "bottling", "external", "other"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export function isLocationKind(v: unknown): v is LocationKind {
  return typeof v === "string" && (LOCATION_KINDS as readonly string[]).includes(v);
}

/** Coerce untrusted input to a valid location kind or null (empty/absent → null = unclassified). */
export function normalizeLocationKind(v: unknown): LocationKind | null {
  if (v == null || v === "") return null;
  if (isLocationKind(v)) return v;
  throw new Error(`Invalid location kind "${String(v)}" (allowed: ${LOCATION_KINDS.join(", ")}).`);
}

/** Human label for a kind (e.g. "crush_pad" → "Crush pad"). */
export function locationKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Unclassified";
  return kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");
}
