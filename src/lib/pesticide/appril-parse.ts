/**
 * Spray S2 Unit 3 — pure APPRIL row parsing. No I/O, no DB, no xlsx library: this module is pure over
 * `Record<string, string>` rows (the streaming reader lives in scripts/pesticide-xlsx-stream.ts, which
 * is what keeps the reader out of the Next bundle per K9) and imports nothing.
 *
 * Measured against the real dump 2026-07-26 (366,591 rows, modified 2026-07-21):
 *  - AIS format: `Name (PCcODE/CAS) - (PCT%), ` repeated; AI names may contain commas
 *    ("1,3-Dichloropropene") so entries are matched by their `(nnnnnn/cas) - (pct%)` signature, never
 *    split on commas. A cell tail that matches no signature is REPORTED, never silently dropped.
 *  - Site strings needing rejection: "Grape-Ivy" (ornamental — NOTE: the plan's /\bGrapes?\b(?!fruit)/
 *    alone DOES match it, the hyphen is a word boundary), "Grapefruit", "Oregongrape" (one word, no
 *    boundary), "Grapevines (Ornamental)".
 *  - K11: EPA spells the modifier "Nonbearing" (no hyphen) — "Grapes (Nonbearing)". Both spellings are
 *    accepted. A bare "Grapes (...)" is UNSPECIFIED — never BEARING.
 *  - Dates arrive as Excel serial strings ("45768.0"); PEST_CAT blank on 317 grape rows — blank is
 *    UNKNOWN (null), never "no category", and never a reason to drop the row.
 */

export type ApprilSiteModifier = "BEARING" | "NON_BEARING" | "UNSPECIFIED";

export interface ApprilAi {
  /** Verbatim APPRIL name — identity, never rewritten (K5/G5). */
  name: string;
  /** EPA PC code (durable key), digits as printed. */
  pcCode: string;
  casNumber: string | null;
  percent: number | null;
}

export interface ApprilSite {
  siteNameRaw: string;
  isGrape: boolean;
  siteModifier: ApprilSiteModifier;
}

export interface ApprilRecord {
  regNumRaw: string;
  productName: string;
  companyName: string | null;
  /** STATUS_DESC verbatim (e.g. "Inactive - Cancelled"). */
  statusRaw: string | null;
  /** STATUS_GROUP verbatim ("Active" | "Inactive" | ...). Ingest scopes on this. */
  statusGroup: string | null;
  /** Raw PEST_CAT; null means UNKNOWN, not "no category". */
  pestCategoryRaw: string | null;
  /** MAX_LABEL_DT Excel serial → Date (attribute only — S2b owns versioning, C13). */
  labelDate: Date | null;
  labelNames: string[];
  ais: ApprilAi[];
  /** Unparseable AIS cell tails — counted and reported, never silently dropped. */
  aisErrors: string[];
  sites: ApprilSite[];
}

export type ApprilRowResult =
  | { ok: true; record: ApprilRecord }
  | { ok: false; error: string };

/** Excel serial ("45768.0") → UTC Date. Serial day 0 is 1899-12-30. */
export function excelSerialToDate(raw: string): Date | null {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000);
}

/**
 * Grape-crop discrimination, measured against the real dump's site vocabulary. The plan's regex
 * /\bGrapes?\b(?!fruit)/ has a hole — "Grape-Ivy" matches it (hyphen is a word boundary) — so the
 * ornamental/citrus look-alikes are rejected explicitly first.
 */
export function isGrapeCropSite(siteNameRaw: string): boolean {
  if (/grape-ivy|grapefruit|oregongrape/i.test(siteNameRaw)) return false;
  if (/grapevines?\s*\(ornamental\)/i.test(siteNameRaw)) return false;
  return /\bGrapes?\b/i.test(siteNameRaw);
}

/** K11: bearing/non-bearing from the site string. EPA writes "Nonbearing"; accept "Non-bearing" too.
 * A bare site string is UNSPECIFIED — the honest default, NOT "both" and NOT bearing. */
export function parseSiteModifier(siteNameRaw: string): ApprilSiteModifier {
  if (/\bnon-?bearing\b/i.test(siteNameRaw)) return "NON_BEARING";
  if (/\bbearing\b/i.test(siteNameRaw)) return "BEARING";
  return "UNSPECIFIED";
}

/** Split a comma-space list cell (SITES, LABEL_NAMES, ABNS). Site names carry no interior ", ". */
function splitListCell(raw: string): string[] {
  return raw
    .split(/,\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseSitesCell(raw: string): ApprilSite[] {
  return splitListCell(raw).map((siteNameRaw) => ({
    siteNameRaw,
    isGrape: isGrapeCropSite(siteNameRaw),
    siteModifier: parseSiteModifier(siteNameRaw),
  }));
}

// One AI entry: `NAME (PCCODE/CAS) - (PCT%)`. Sticky + sequential so names may contain commas and
// parentheses — an entry is delimited by its signature, not by separators.
const AI_ENTRY = /\s*(.+?)\s*\((\d{5,6})\/([^()]*)\)\s*-\s*\(([\d.]*)%\)\s*(?:,|$)/y;

export function parseAisCell(raw: string): { ais: ApprilAi[]; errors: string[] } {
  const ais: ApprilAi[] = [];
  const errors: string[] = [];
  const input = raw.trim();
  if (input.length === 0) return { ais, errors };
  AI_ENTRY.lastIndex = 0;
  let cursor = 0;
  for (;;) {
    AI_ENTRY.lastIndex = cursor;
    const m = AI_ENTRY.exec(input);
    if (!m) break;
    const cas = m[3].trim();
    const pct = m[4] === "" ? null : Number.parseFloat(m[4]);
    ais.push({
      name: m[1].trim(),
      pcCode: m[2],
      casNumber: cas === "" || cas === "-" ? null : cas,
      percent: pct != null && Number.isFinite(pct) ? pct : null,
    });
    cursor = AI_ENTRY.lastIndex;
  }
  const tail = input.slice(cursor).trim().replace(/^,\s*/, "");
  if (tail.length > 0) {
    errors.push(`unparseable AIS tail: ${tail.slice(0, 120)}`);
  }
  return { ais, errors };
}

export function parseApprilRow(row: Record<string, string>): ApprilRowResult {
  const regNumRaw = (row.REG_NUM ?? "").trim();
  if (regNumRaw.length === 0) return { ok: false, error: "missing REG_NUM" };
  // Measured 2026-07-26: ~4,750 real dump rows (overwhelmingly Inactive, but 7 Active-grape) carry an
  // empty PRODUCT_NAME. Fall back to the ABNS primary name; a still-nameless row is a typed failure
  // the ingest counts as a skip, not a run-failing error — it is a property of the dump.
  let productName = (row.PRODUCT_NAME ?? "").trim();
  if (productName.length === 0) {
    const primary = (row.ABNS ?? "").split(/,\s+/).find((a) => /\(Primary Name\)\s*$/i.test(a));
    productName = (primary ?? "").replace(/\s*\(Primary Name\)\s*$/i, "").trim();
  }
  if (productName.length === 0) return { ok: false, error: `missing PRODUCT_NAME for ${regNumRaw}` };

  const { ais, errors: aisErrors } = parseAisCell(row.AIS ?? "");
  const pestCat = (row.PEST_CAT ?? "").trim();

  return {
    ok: true,
    record: {
      regNumRaw,
      productName,
      companyName: (row.COMPANY_NAME ?? "").trim() || null,
      statusRaw: (row.STATUS_DESC ?? "").trim() || null,
      statusGroup: (row.STATUS_GROUP ?? "").trim() || null,
      // blank PEST_CAT is UNKNOWN (null) — 317 grape rows are blank and must not vanish from
      // class-filtered views; multi-class values ("Insecticide, Miticide") are kept raw, uncollapsed.
      pestCategoryRaw: pestCat.length === 0 ? null : pestCat,
      labelDate: excelSerialToDate(row.MAX_LABEL_DT ?? ""),
      labelNames: splitListCell(row.LABEL_NAMES ?? ""),
      ais,
      aisErrors,
      sites: parseSitesCell(row.SITES ?? ""),
    },
  };
}
