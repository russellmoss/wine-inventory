import { normalizeMaterialKey } from "@/lib/cellar/material-normalize";
import type { MaterialCategory } from "@/lib/cellar/material-taxonomy";

// Plan 072 · Unit 6 — PURE material matcher for the invoice-review screen. Given ONE extracted
// invoice line (a name, and optionally the vendor + the vendor's item code) it surfaces the existing
// catalog materials that line most likely already IS, so review can offer "add to existing" instead of
// silently creating a duplicate. NO prisma / server imports: the caller supplies the candidate list
// (already tenant-scoped) AND each candidate's vendor-scoped codes (from VendorMaterialCode). This mirrors
// material-taxonomy.ts / vendors-shared.ts (pure + client-safe + directly unit-tested).
//
// Ranking (best-first):
//   1.0  exact VENDOR-SCOPED code match — the vendor's own SKU for this material. Highest trust. Codes are
//        vendor-specific, so a code match under a DIFFERENT vendorId does NOT count (a shared string like
//        "100" means different things to different vendors).
//   0.9  exact normalized-NAME equality (reuses the material dedup key, so spacing/punctuation variants collapse).
//   0.6  two-directional normalized-substring name match (mirrors matchVendorsByName: A ⊇ B OR B ⊇ A), so
//        "Lafazym Extract" pairs with the stored "LAFFORT LAFAZYM EXTRACT" and vice-versa.
// No match → the candidate is omitted (an empty array means "nothing in the catalog looks like this line" →
// the UI defaults to create-new). Matching spans ALL categories — EQUIPMENT included, never filtered out.

/** A vendor's own item code (SKU) for a specific material, from the VendorMaterialCode table. */
export type VendorCodeRef = { vendorId: string; code: string };

/** One existing catalog material the caller offers as a possible match, carrying its known vendor codes. */
export type MaterialCandidate = {
  materialId: string;
  name: string;
  category: MaterialCategory | string;
  vendorCodes?: VendorCodeRef[];
};

/** The extracted invoice line to match against the catalog. */
export type MaterialMatchQuery = {
  name: string;
  vendorId?: string | null;
  vendorItemCode?: string | null;
};

/** A ranked match for the review screen. `confidence` sorts the list; `reason` explains it to the human. */
export type MaterialMatch = {
  materialId: string;
  name: string;
  category: string;
  confidence: number;
  reason: string;
};

/** Confidence tiers, named so the caller/UI can threshold on them rather than on magic numbers. */
export const MATCH_CONFIDENCE = {
  EXACT_VENDOR_CODE: 1.0,
  EXACT_NAME: 0.9,
  SUBSTRING_NAME: 0.6,
} as const;

/**
 * Normalize a vendor item code for comparison: trim, UPPERCASE, and strip spaces/hyphens so "2230-517",
 * "2230 517" and "2230517" all match. Blank / no alphanumeric content → null (an unusable code never matches).
 */
function normalizeVendorCode(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return s.length > 0 ? s : null;
}

/** Normalize a name to the material dedup key (strip non-alphanumeric, UPPERCASE); "" when empty. */
function normalizeName(raw: unknown): string {
  try {
    return normalizeMaterialKey(raw);
  } catch {
    // normalizeMaterialKey throws on empty/no-alphanumeric input; a query/candidate with no usable name
    // simply can't match by name, so treat it as the empty key rather than propagating.
    return "";
  }
}

/**
 * For ONE candidate, compute its best match against the query (or null if it doesn't match at all). A vendor
 * code match always beats a name match, and exact name beats substring — so we check in descending-confidence
 * order and return the first hit.
 */
function scoreCandidate(candidate: MaterialCandidate, query: MaterialMatchQuery): MaterialMatch | null {
  const base = { materialId: candidate.materialId, name: candidate.name, category: String(candidate.category) };

  // 1. Exact vendor-scoped code match — only counts when the code belongs to the SAME vendor as the line.
  const queryCode = normalizeVendorCode(query.vendorItemCode);
  const queryVendorId = query.vendorId ?? null;
  if (queryCode && queryVendorId) {
    for (const vc of candidate.vendorCodes ?? []) {
      if (vc.vendorId === queryVendorId && normalizeVendorCode(vc.code) === queryCode) {
        return { ...base, confidence: MATCH_CONFIDENCE.EXACT_VENDOR_CODE, reason: `vendor code ${vc.code}` };
      }
    }
  }

  // 2 & 3. Name matching (two-directional, mirrors matchVendorsByName).
  const needle = normalizeName(query.name);
  const hay = normalizeName(candidate.name);
  if (needle && hay) {
    if (needle === hay) {
      return { ...base, confidence: MATCH_CONFIDENCE.EXACT_NAME, reason: `name match: ${candidate.name}` };
    }
    if (hay.includes(needle) || needle.includes(hay)) {
      // Show which way the containment runs so the human sees why these two were paired.
      const arrow = hay.includes(needle) ? "⊇" : "⊆";
      return {
        ...base,
        confidence: MATCH_CONFIDENCE.SUBSTRING_NAME,
        reason: `name match: ${candidate.name} ${arrow} ${query.name}`,
      };
    }
  }

  return null;
}

/**
 * Rank the catalog candidates for one extracted invoice line, best-first. Returns ONLY real matches (empty
 * array when nothing matches). Ties (same confidence) keep the candidate input order, which is stable. Pure.
 */
export function matchMaterials(
  candidates: readonly MaterialCandidate[],
  query: MaterialMatchQuery,
): MaterialMatch[] {
  const matches: MaterialMatch[] = [];
  for (const c of candidates ?? []) {
    const m = scoreCandidate(c, query);
    if (m) matches.push(m);
  }
  // Descending confidence; stable for equal scores (preserves caller ordering among same-confidence hits).
  return matches.sort((a, b) => b.confidence - a.confidence);
}
