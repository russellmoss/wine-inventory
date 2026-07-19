// Optional REFERENCE attributes on a grape variety (ticket #308): clone, rootstock,
// source nursery, berry color, species.
//
// These are DESCRIPTIVE master data, not identity. A variety is still keyed by name +
// abbreviation, and the abbreviation is what reaches a lot code — nothing here does.
// That separation is deliberate: a winemaker can correct a mistyped rootstock on a
// variety that is already in use without touching a single historical record, because
// no ledger, cost, or compliance path reads these columns.
//
// Pure module — no DB, no server imports — so the same parsing and the same wording are
// shared by the client hint and the server action (same pattern as bottling/abv-range.ts).

export const BERRY_COLORS = ["BLACK", "WHITE"] as const;
export const VINE_SPECIES = ["VINIFERA", "HYBRID", "OTHER"] as const;

export type BerryColorValue = (typeof BERRY_COLORS)[number];
export type VineSpeciesValue = (typeof VINE_SPECIES)[number];

/** Display labels — the winemaker's vocabulary, not the enum token. */
export const BERRY_COLOR_LABELS: Record<BerryColorValue, string> = {
  BLACK: "Black",
  WHITE: "White",
};

export const VINE_SPECIES_LABELS: Record<VineSpeciesValue, string> = {
  VINIFERA: "Vinifera",
  HYBRID: "Hybrid",
  OTHER: "Other",
};

/** Matches the 80-char ceiling already used for a variety name in reference/actions.ts. */
export const MAX_DETAIL_LENGTH = 80;

export type VarietyDetails = {
  clone: string | null;
  rootstock: string | null;
  nursery: string | null;
  berryColor: BerryColorValue | null;
  species: VineSpeciesValue | null;
};

/** Every detail absent — what a variety created without the optional section gets. */
export const EMPTY_VARIETY_DETAILS: VarietyDetails = {
  clone: null,
  rootstock: null,
  nursery: null,
  berryColor: null,
  species: null,
};

export type ParseResult =
  | { ok: true; value: VarietyDetails }
  | { ok: false; error: string };

/**
 * Trim a free-text detail. Blank (or absent) means "not recorded" and normalizes to
 * null, so an empty box never writes an empty string that would render as a stray blank.
 */
export function cleanDetailText(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed === "" ? null : trimmed;
}

function isBerryColor(value: string): value is BerryColorValue {
  return (BERRY_COLORS as readonly string[]).includes(value);
}

function isVineSpecies(value: string): value is VineSpeciesValue {
  return (VINE_SPECIES as readonly string[]).includes(value);
}

/**
 * Parse the five optional detail fields off a form/actions payload.
 *
 * Returns a friendly message instead of throwing so the client can show the same text
 * inline that the server would reject with. Unknown enum values are refused rather than
 * silently dropped — a dropped value would look saved to the winemaker but read back empty.
 */
export function parseVarietyDetails(raw: {
  clone?: unknown;
  rootstock?: unknown;
  nursery?: unknown;
  berryColor?: unknown;
  species?: unknown;
}): ParseResult {
  const texts: Array<[keyof VarietyDetails, string, unknown]> = [
    ["clone", "Clone", raw.clone],
    ["rootstock", "Rootstock", raw.rootstock],
    ["nursery", "Nursery", raw.nursery],
  ];

  const value: VarietyDetails = { ...EMPTY_VARIETY_DETAILS };

  for (const [key, label, input] of texts) {
    const cleaned = cleanDetailText(input);
    if (cleaned !== null && cleaned.length > MAX_DETAIL_LENGTH) {
      return { ok: false, error: `${label} is too long (max ${MAX_DETAIL_LENGTH} characters).` };
    }
    // Only the three text keys are assigned in this loop, so the cast is safe.
    (value as Record<string, string | null>)[key] = cleaned;
  }

  const colorRaw = cleanDetailText(raw.berryColor);
  if (colorRaw !== null) {
    const upper = colorRaw.toUpperCase();
    if (!isBerryColor(upper)) {
      return { ok: false, error: "Color must be black or white." };
    }
    value.berryColor = upper;
  }

  const speciesRaw = cleanDetailText(raw.species);
  if (speciesRaw !== null) {
    const upper = speciesRaw.toUpperCase();
    if (!isVineSpecies(upper)) {
      return { ok: false, error: "Species must be vinifera, hybrid, or other." };
    }
    value.species = upper;
  }

  return { ok: true, value };
}

/** True when nothing was recorded — used to skip a pointless audit entry. */
export function isEmptyVarietyDetails(details: VarietyDetails): boolean {
  return (
    details.clone === null &&
    details.rootstock === null &&
    details.nursery === null &&
    details.berryColor === null &&
    details.species === null
  );
}
