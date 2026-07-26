/**
 * Spray S2 Unit 9 — pure resistance-code derivation. No I/O, no DB.
 *
 * BINDING CONSTRAINT (runbook §3.17, upheld against the council's P1): no FRAC / HRAC / IRAC
 * compilation is parsed or redistributed. Codes are derived from Tier-1 EXTENSION sources already in
 * our corpus — UC IPM's grape Pest Management Guidelines — and every derived row carries its
 * citation. The Unit 11 positive-allowlist guard makes that mechanical rather than aspirational.
 *
 * K4 — the Switch guard, applied here as well as in the DB CHECK: UC IPM's table is AI-KEYED. Its
 * trade-name parentheticals ("cyprodinil/fludioxonil (Switch)") say *this product contains these
 * AIs*, NOT *this product's code is this*. We extract AI→code ONLY. Product-level codes come from
 * the constituent AIs (the K13 rollup in lookup.ts), never from a trade name in an AI-keyed row.
 *
 * K3 — siteType is derived independently of the code: UC IPM writes "multi-site (M 04)" for captan,
 * so captan is CODED ["M 04"] with siteType MULTI. Both facts are true and they answer different
 * questions; rotation keys off siteType.
 *
 * K5 — biologicals: a strain suffix collapses onto an EXPLICITLY CITED species (curated in
 * ai-normalization.json), never a genus generalization. An organism with no cited row lands in GAP.
 */

export type Resolution = "CODED" | "NO_CODE_EXISTS" | "GAP";
export type SiteType = "SINGLE" | "MULTI" | "UNKNOWN";

export interface ParsedModeOfAction {
  codes: string[];
  siteType: SiteType;
  /** true when the source explicitly says the compound is NOT coded (UC IPM "NC" / "not classified"). */
  notCoded: boolean;
}

/** Canonical FRAC code spelling: uppercase letter groups keep ONE space ("M 04", "BM 02", "U 06");
 * numeric groups are bare ("11", "7"). Leading zeros are preserved because that is how the sources
 * and the committees write them. */
export function canonicalizeCode(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ").toUpperCase();
  if (t.length === 0) return null;
  const letters = /^(BM|M|U|P|NC)\s*0*(\d+)$/.exec(t);
  if (letters) {
    if (letters[1] === "NC") return null;
    return `${letters[1]} ${letters[2].padStart(2, "0")}`;
  }
  if (/^\d+$/.test(t)) return String(Number.parseInt(t, 10));
  return null;
}

/**
 * Parse a UC IPM "Mode of action (FRAC group number)" cell.
 * Shapes seen in the live table (2024-07 revision):
 *   "single-site (11)" · "multi-site (M 04)" · "unknown (U 06)" · "BM 02" ·
 *   "single-site/single-site (7/11)" · "single-site/ single-site (9/12)" · "NC" / "not classified"
 */
export function parseModeOfAction(cell: string): ParsedModeOfAction {
  const text = cell.replace(/<[^>]*>/g, " ").replace(/&nbsp;?/gi, " ").replace(/\s+/g, " ").trim();
  if (text.length === 0) return { codes: [], siteType: "UNKNOWN", notCoded: false };
  if (/^(nc|not classified)$/i.test(text)) return { codes: [], siteType: "UNKNOWN", notCoded: true };

  // NB the live table writes BOTH "single-site" and "single site" (trifloxystrobin) — a hyphen-only
  // pattern silently drops the siteType, which is the K3 field rotation keys off.
  const siteType: SiteType = /multi[-\s]?site/i.test(text) ? "MULTI" : /single[-\s]?site/i.test(text) ? "SINGLE" : "UNKNOWN";

  // Codes live inside the trailing parentheses when present ("single-site (9/12)"), otherwise the
  // whole cell is the code ("BM 02").
  const paren = /\(([^)]*)\)\s*$/.exec(text);
  const codeText = paren ? paren[1] : text;
  const codes = codeText
    .split("/")
    .map((p) => canonicalizeCode(p))
    .filter((c): c is string => c != null);
  const notCoded = codes.length === 0 && /\bnc\b|not classified/i.test(codeText);
  return { codes: [...new Set(codes)], siteType, notCoded };
}

export interface ExtensionRow {
  /** The row's common-name cell, verbatim (may carry a trade-name parenthetical we deliberately drop). */
  subjectRaw: string;
  /** AI names extracted from the common-name cell — a premix row yields one per constituent. */
  aiNames: string[];
  codes: string[];
  siteType: SiteType;
  notCoded: boolean;
}

/** Strip the trade-name parenthetical and footnote markers, then split a premix row on "/". */
export function parseCommonNameCell(cell: string): { aiNames: string[]; cleaned: string } {
  const cleaned = cell
    .replace(/<[^>]*>/g, "")
    .replace(/\([^)]*\)/g, "") // the trade-name parenthetical — K4: never a product key
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const aiNames = cleaned
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { aiNames, cleaned };
}

/** Extract AI-keyed rows from a UC IPM table's HTML. Row shape: common-name | class | activity | MoA | … */
export function extractUcIpmRows(html: string): ExtensionRow[] {
  const rows: ExtensionRow[] = [];
  for (const m of html.matchAll(/<tr>(.*?)<\/tr>/gis)) {
    const cells = [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((c) => c[1]);
    if (cells.length < 4) continue;
    const { aiNames } = parseCommonNameCell(cells[0]);
    if (aiNames.length === 0) continue;
    const moa = parseModeOfAction(cells[3]);
    // A premix row's codes are POSITIONAL: "boscalid/pyraclostrobin" + "(7/11)" → boscalid 7,
    // pyraclostrobin 11. When the counts don't line up we do NOT guess — the row is skipped and the
    // AIs stay in GAP (visible), which is the safe direction.
    if (aiNames.length > 1 && moa.codes.length !== aiNames.length) continue;
    rows.push({ subjectRaw: cells[0].replace(/<[^>]*>/g, "").trim(), aiNames, codes: moa.codes, siteType: moa.siteType, notCoded: moa.notCoded });
  }
  return rows;
}

/**
 * The biologicals/natural-products table is TRADE-NAME keyed and carries its code in the first data
 * cell ("low (BM 02)"), not the MoA column. Per council G6 these are PRODUCT names, so they are only
 * ever emitted as trade-name-map PROPOSALS for a human to confirm — an auto-applied trade-name match
 * is the same silent mis-attribution K4 and K6 exist to prevent.
 */
export interface TradeNameProposal {
  tradeNames: string[];
  codes: string[];
  notCoded: boolean;
}

export function extractUcIpmBiologicalProposals(html: string): TradeNameProposal[] {
  const out: TradeNameProposal[] = [];
  for (const m of html.matchAll(/<tr>(.*?)<\/tr>/gis)) {
    const cells = [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((c) => c[1]);
    if (cells.length < 2) continue;
    const nameCell = cells[0].replace(/<[^>]*>/g, "").replace(/\s*\d\s*$/, "").trim();
    if (nameCell.length === 0) continue;
    const risk = cells[1].replace(/<[^>]*>/g, "").trim();
    if (!/^(low|medium|high)\b/i.test(risk)) continue; // not a data row of this table
    const moa = parseModeOfAction(risk);
    out.push({
      // "Cinnacure, Seican, Cinnerate" and "Timorex (Act, Gold)" list several trade names per row.
      tradeNames: nameCell.replace(/[()]/g, ", ").split(",").map((s) => s.trim()).filter((s) => s.length > 0),
      codes: moa.codes,
      notCoded: moa.notCoded,
    });
  }
  return out;
}

/** Per-AI assignments from extension rows: a premix row splits positionally. */
export function toAiAssignments(rows: ExtensionRow[]): { aiName: string; codes: string[]; siteType: SiteType; notCoded: boolean }[] {
  const out: { aiName: string; codes: string[]; siteType: SiteType; notCoded: boolean }[] = [];
  for (const row of rows) {
    if (row.aiNames.length === 1) {
      out.push({ aiName: row.aiNames[0], codes: row.codes, siteType: row.siteType, notCoded: row.notCoded });
    } else {
      row.aiNames.forEach((aiName, i) => {
        out.push({ aiName, codes: [row.codes[i]], siteType: row.siteType, notCoded: false });
      });
    }
  }
  return out;
}

/** Lowercase / collapse whitespace / drop trailing qualifiers APPRIL appends. Identity is NEVER
 * rewritten by this (K5/G5) — it is a join key only. */
export function normalizeAiName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(no inert use\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolutionOf(a: { codes: string[]; notCoded: boolean } | undefined): Resolution {
  if (!a) return "GAP";
  if (a.codes.length > 0) return "CODED";
  if (a.notCoded) return "NO_CODE_EXISTS";
  return "GAP";
}

export interface CoverageReport {
  totalAis: number;
  coded: number;
  noCodeExists: number;
  gap: number;
  unclassified: number;
  /** The number that turns the Cornell purchase into a decision (data-sources §5). */
  biologicalsShareOfGap: number;
  /** How much of the copper/mancozeb tail ai-normalization.json rescued. */
  normalizationRecovered: number;
  /** Cited codes we could not attach to any product — itself worth knowing. */
  unattachedCitedSubjects: number;
  /** FRAC-scoped denominator: FRAC codes fungicides only, so the whole-set GAP number is dominated
   * by insecticides/herbicides/PGRs that no FRAC scheme covers. These are the counts a rotation
   * question actually depends on — AIs that appear in at least one FUNGICIDE product. */
  fungicideScoped: { total: number; coded: number; noCodeExists: number; gap: number; biologicalsInGap: number };
}

const BIOLOGICAL = /bacillus|trichoderma|aureobasidium|streptomyces|pseudomonas|beauveria|metarhizium|saccharomyces|cerevisane|reynoutria|chitosan|yeast|virus|nematode|extract of/i;

export function isBiological(aiName: string): boolean {
  return BIOLOGICAL.test(aiName);
}

export function buildCoverageReport(
  ais: { name: string; resolution: Resolution; viaNormalization: boolean; inFungicideProduct?: boolean }[],
  unattachedCitedSubjects: number,
): CoverageReport {
  const bucket = (r: Resolution) => ais.filter((a) => a.resolution === r);
  const gap = bucket("GAP");
  const fung = ais.filter((a) => a.inFungicideProduct);
  const fungBucket = (r: Resolution) => fung.filter((a) => a.resolution === r).length;
  return {
    fungicideScoped: {
      total: fung.length,
      coded: fungBucket("CODED"),
      noCodeExists: fungBucket("NO_CODE_EXISTS"),
      gap: fungBucket("GAP"),
      biologicalsInGap: fung.filter((a) => a.resolution === "GAP" && isBiological(a.name)).length,
    },
    totalAis: ais.length,
    coded: bucket("CODED").length,
    noCodeExists: bucket("NO_CODE_EXISTS").length,
    gap: gap.length,
    unclassified: ais.length - bucket("CODED").length - bucket("NO_CODE_EXISTS").length - gap.length,
    biologicalsShareOfGap: gap.filter((a) => isBiological(a.name)).length,
    normalizationRecovered: ais.filter((a) => a.viaNormalization && a.resolution !== "GAP").length,
    unattachedCitedSubjects,
  };
}
