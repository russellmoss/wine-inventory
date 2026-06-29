// Pure lot-code generation (Phase 3 / plan 017). No DB, no server imports — turns a lot's
// origin + abbreviations into a human-readable code: YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG],
// with numeric disambiguation on collision. Unit-tested directly. The code is a LABEL, not
// identity (D3); it is generated once at creation and immutable after (INVARIANTS) — the only
// exception is the one-time legacy recode.

/** Uppercase, strip to alphanumerics. Returns "" for empty/nullish. */
export function normalizeToken(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/** A variety/vineyard abbreviation: 2–4 uppercase alphanumerics. Throws if it can't form one. */
export function normalizeAbbr(raw: unknown): string {
  const t = normalizeToken(raw);
  if (t.length < 2 || t.length > 4) {
    throw new Error("Abbreviation must be 2–4 letters or numbers.");
  }
  return t;
}

/** Block token for the code: explicit block code wins; else strip a leading "BLOCK" from the label. */
export function blockToken(blockCode?: string | null, blockLabel?: string | null): string {
  if (blockCode != null && normalizeToken(blockCode)) return normalizeToken(blockCode);
  const label = String(blockLabel ?? "").replace(/^\s*block\s*/i, "");
  return normalizeToken(label);
}

export type LotCodeParts = {
  vintage: number;
  vineyardAbbr: string;
  varietyAbbr: string;
  blockToken?: string;
  subblockToken?: string;
  tag?: string;
};

/**
 * Compose the base lot code from its parts, in order:
 * YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG]. Empty optional slots are dropped (legacy lots
 * have no block). Vintage, vineyard, and variety are required.
 */
export function buildLotCode(parts: LotCodeParts): string {
  if (parts == null || parts.vintage == null || !Number.isFinite(parts.vintage)) {
    throw new Error("Lot code requires a vintage year.");
  }
  const vineyard = normalizeToken(parts.vineyardAbbr);
  const variety = normalizeToken(parts.varietyAbbr);
  if (!vineyard) throw new Error("Lot code requires a vineyard abbreviation.");
  if (!variety) throw new Error("Lot code requires a variety abbreviation.");

  const ordered = [
    String(parts.vintage),
    vineyard,
    normalizeToken(parts.blockToken),
    normalizeToken(parts.subblockToken),
    variety,
    normalizeToken(parts.tag),
  ].filter((p) => p.length > 0);

  return ordered.join("-");
}

// ─────────────────────── Phase 5: blend lot codes ───────────────────────

/**
 * A blend token: a winemaker-set 2–4 LETTER tag (uppercased, punctuation/whitespace stripped),
 * e.g. "est" → "EST". Letters only — a blend code carries no vineyard/variety provenance, so
 * the tag is the winemaker's free label. Throws if it can't form a 2–4 letter token.
 */
export function normalizeBlendToken(raw: unknown): string {
  const t = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (t.length < 2 || t.length > 4) {
    throw new Error("Blend token must be 2–4 letters.");
  }
  return t;
}

export type BlendLotCodeParts = { vintage?: number | null; token: string };

/**
 * Compose a BLEND lot code: `[vintage]-BL-<TOKEN>` (e.g. `2024-BL-EST`), or `NV-BL-<TOKEN>`
 * when there is no single vintage (NV / multi-vintage — D3). Deliberately has NO vineyard or
 * variety segment: a multi-source blend must not masquerade as single-origin. Only the NEW-LOT
 * blend mode mints a code; GROW-EXISTING keeps the resident lot's immutable code.
 */
export function buildBlendLotCode(parts: BlendLotCodeParts): string {
  const token = normalizeBlendToken(parts.token);
  const vintageSeg =
    parts.vintage != null && Number.isFinite(parts.vintage) ? String(parts.vintage) : "NV";
  return `${vintageSeg}-BL-${token}`;
}

/**
 * Return `base` if it is not already taken, else the first free `base-2`, `base-3`, …
 * Pass the set/array of existing codes (e.g. those sharing the base prefix).
 */
export function disambiguate(base: string, existing: Iterable<string>): string {
  const taken = existing instanceof Set ? existing : new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
