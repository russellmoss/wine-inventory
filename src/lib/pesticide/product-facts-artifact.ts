/**
 * Spray S2b Unit 2 — the curated product-facts ARTIFACT shape and its discipline rules. Pure (no
 * Prisma, no I/O): both `scripts/seed-product-facts.ts` and the artifact-discipline test import this,
 * so there is exactly one definition of "what a valid curated row is" (the same reason
 * pesticide-boundaries.test.ts's licensing checks live once, not twice).
 *
 * `src/lib/pesticide/data/product-facts.json` is the reviewed truth (KD-8): every row that reaches
 * the database goes through this file first, and REPLAY (the seeder's default mode) re-derives the
 * DB from it rather than trusting a live source. A row with `reviewedBy: null` is a PROPOSAL, not a
 * curated fact — `--propose` only ever writes proposals (rule §3.1).
 */

export type ArtifactFactGroup = "REGULATORY" | "AGRONOMIC";
export type ArtifactMobilityClass = "CONTACT_PROTECTANT" | "TRANSLAMINAR" | "LOCALLY_SYSTEMIC" | "MOBILE_SYSTEMIC";
export type ArtifactAdjuvantRequirement = "REQUIRED" | "OPTIONAL" | "PROHIBITED" | "UNSPECIFIED";

export interface ProductFactsArtifactRow {
  epaRegNumber: string;
  factGroup: ArtifactFactGroup;
  /** KD-1: the label date the REVIEWER read, not CDPR's mutable labelDate. */
  labelVersionKey: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceAsOf: string;
  /** null = a PROPOSAL (e.g. the CDPR seed) — not a curated fact until a human signs it. */
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewDueAt: string;
  reviewNote?: string | null;
  // REGULATORY-group fields
  worstCasePhiDays?: number | null;
  worstCaseReiHours?: number | null;
  minRepeatIntervalDays?: number | null;
  maxApplicationsPerSeason?: number | null;
  maxAiPerSeasonAmount?: number | null;
  maxAiPerSeasonUnit?: string | null;
  requiresBulletinCheck?: boolean | null;
  adjuvantRequirement?: ArtifactAdjuvantRequirement | null;
  // AGRONOMIC-group fields
  rainfastHours?: number | null;
  mobilityClass?: ArtifactMobilityClass | null;
  agronomicClass?: string[];
}

/**
 * Label-adjacent regulatory authorities ONLY — the two hosts a REGULATORY row (PHI, REI, seasonal
 * maxima, bulletin flag) may cite. Everything else in TRUSTED_DOMAINS is extension literature, valid
 * only for the AGRONOMIC group (rainfast, mobility class, agronomic class tags). This is the council
 * S5 falsification case, enforced structurally: a UC IPM citation can never back a PHI value, and an
 * EPA/CDPR citation can never back a rainfast value.
 */
export const REGULATORY_SOURCE_HOSTS: ReadonlySet<string> = new Set(["www3.epa.gov", "files.cdpr.ca.gov"]);

/** No FRAC/HRAC/IRAC compilation may be cited anywhere in this artifact (rule §3.17, binding).
 * Both bare and www-prefixed forms — TRUSTED_DOMAINS itself mixes the two, so hostOf() deliberately
 * does NOT normalize away "www." (stripping it would false-negative a real trusted host that IS
 * listed with the prefix, e.g. "www.hort.cornell.edu"). */
const RESISTANCE_COMPILATION_HOSTS: ReadonlySet<string> = new Set([
  "frac.info",
  "www.frac.info",
  "hracglobal.com",
  "www.hracglobal.com",
  "irac-online.org",
  "www.irac-online.org",
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** One row's violations, or `[]` if it satisfies every discipline rule. */
export function validateArtifactRow(row: ProductFactsArtifactRow, trustedHosts: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const label = `${row.epaRegNumber}/${row.factGroup}`;

  if (!row.epaRegNumber) errors.push(`${label}: missing epaRegNumber`);
  if (!row.labelVersionKey) errors.push(`${label}: missing labelVersionKey`);
  if (!row.sourceUrl) errors.push(`${label}: missing sourceUrl`);
  if (!row.sourceTitle) errors.push(`${label}: missing sourceTitle`);
  if (!row.sourceAsOf) errors.push(`${label}: missing sourceAsOf`);
  if (!row.reviewDueAt) errors.push(`${label}: missing reviewDueAt`);
  // reviewedBy is INTENTIONALLY not required — null is a valid, meaningful state (a proposal).
  if (row.reviewedBy != null && !row.reviewedAt) errors.push(`${label}: reviewedBy without reviewedAt`);

  const host = row.sourceUrl ? hostOf(row.sourceUrl) : null;
  if (row.sourceUrl && !host) errors.push(`${label}: sourceUrl is not a valid URL`);
  if (host && RESISTANCE_COMPILATION_HOSTS.has(host)) {
    errors.push(`${label}: cites a FRAC/HRAC/IRAC compilation host (${host}) — never permitted (rule §3.17)`);
  }
  if (host && !trustedHosts.has(host)) errors.push(`${label}: sourceUrl host (${host}) is not in the trusted allowlist`);
  if (host) {
    const isRegulatoryHost = REGULATORY_SOURCE_HOSTS.has(host);
    if (row.factGroup === "REGULATORY" && !isRegulatoryHost) {
      errors.push(`${label}: a REGULATORY row cannot cite an extension source (${host}) — PHI/REI/seasonal-maxima come from the label, not extension prose`);
    }
    if (row.factGroup === "AGRONOMIC" && isRegulatoryHost) {
      errors.push(`${label}: an AGRONOMIC row cannot claim an EPA/CDPR label (${host}) as the source of a rainfast/mobility value`);
    }
  }

  // No column may carry a non-null default readable as a known value (§3.6) — a scalar of exactly
  // 0 with no unit context is the exact "PHI = 0, pick today" failure the CDPR probe found.
  if (row.factGroup === "REGULATORY") {
    if (row.worstCasePhiDays === 0 && !row.reviewNote) {
      errors.push(`${label}: worstCasePhiDays=0 with no reviewNote — a zero interval must be explainable as reviewed, not a default`);
    }
  }

  return errors;
}

/** Whole-artifact checks that need every row at once. */
export function validateArtifact(rows: readonly ProductFactsArtifactRow[], trustedHosts: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  for (const row of rows) errors.push(...validateArtifactRow(row, trustedHosts));

  // KD-1: the artifact is a snapshot of CURRENT rows, not a history — at most one entry per
  // (epaRegNumber, factGroup). Version history lives in the DB's superseded rows, never here.
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = `${row.epaRegNumber}::${row.factGroup}`;
    if (seen.has(key)) errors.push(`duplicate (epaRegNumber, factGroup) in the artifact: ${key} (rows ${seen.get(key)} and ${i})`);
    else seen.set(key, i);
  });

  return errors;
}
