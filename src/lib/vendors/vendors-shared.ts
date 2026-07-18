// Plan 069: client-safe vendor vocabulary, DTO types, and PURE sanitizers. NO server imports (prisma/tenant/
// audit) live here, so 'use client' components (VendorForm, VendorPicker, /setup/vendors) and unit tests can
// import these without dragging the server data layer into the browser bundle. The server cores in vendors.ts
// wrap these sanitizers (and throw ActionError on the returned `error`).

// `similarity` is a PURE edit-distance helper (no React/DB) — safe to import into a client-safe module.
import { similarity } from "@/lib/inventory/similarity";

/** Suggested payment-terms values for the form datalist. `terms` stays a FREE string (it drives the QBO Bill
 *  DueDate, U10) — these are hints, not an enum, so no migration is needed to add one. */
export const PAYMENT_TERMS_SUGGESTIONS = ["Pay at purchase", "Net 15", "Net 30", "Net 45", "Net 60"] as const;

/** The seeded per-tenant fallback vendor. Backfill maps blank/legacy-less rows here; non-UI paths resolve to it. */
export const UNKNOWN_VENDOR_NAME = "Unknown / Unspecified";

// ── DTO shapes (read side) ──

export type VendorContactRow = {
  id: string;
  vendorId: string;
  name: string;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  isPrimary: boolean;
};

export type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  accountNumber: string | null;
  poRequired: boolean;
  terms: string | null;
  url: string | null;
  notes: string | null;
  isActive: boolean;
  contacts: VendorContactRow[];
};

// ── Input shapes (write side) ──

export type VendorContactInput = {
  /** present → update that existing contact; absent/blank → create a new one. */
  id?: string | null;
  name: string;
  role?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  isPrimary?: boolean | null;
};

export type VendorInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  accountNumber?: string | null;
  poRequired?: boolean | null;
  terms?: string | null;
  url?: string | null;
  notes?: string | null;
  contacts?: VendorContactInput[];
};

// ── Pure sanitizers (no throw; the server core throws ActionError on `error`) ──

/** Trim + length-cap a free-text field; blank → null. */
export const trimOrNull = (v: unknown, max = 200): string | null => {
  const s = String(v ?? "").trim().slice(0, max);
  return s.length > 0 ? s : null;
};

/** Loose "looks like an email" check (not RFC-perfect — enough to catch fat-fingered input). */
export function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Keep a URL only if http(s); a bare domain gets https://; any other scheme is dropped (defense-in-depth for
 *  href render). Duplicated intentionally from material-fields.ts so this file stays server-import-free. */
export function normalizeVendorUrl(v: unknown): string | null {
  const s = trimOrNull(v, 300);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // some other scheme → reject
  return `https://${s}`.slice(0, 300); // bare domain → assume https
}

export type CleanVendor = {
  name: string;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  accountNumber: string | null;
  poRequired: boolean;
  terms: string | null;
  url: string | null;
  notes: string | null;
};

/** Sanitize the vendor fields. Returns the persisted field set + the first validation error (null if OK). Pure. */
export function sanitizeVendor(input: VendorInput): { fields: CleanVendor | null; error: string | null } {
  const name = trimOrNull(input?.name);
  if (!name) return { fields: null, error: "Vendor needs a name." };
  const email = trimOrNull(input?.email);
  if (email && !isLikelyEmail(email)) return { fields: null, error: "That vendor email address doesn't look right." };
  return {
    fields: {
      name,
      phone: trimOrNull(input?.phone),
      email,
      contactName: trimOrNull(input?.contactName),
      accountNumber: trimOrNull(input?.accountNumber),
      poRequired: !!input?.poRequired,
      terms: trimOrNull(input?.terms),
      url: normalizeVendorUrl(input?.url),
      notes: trimOrNull(input?.notes, 2000),
    },
    error: null,
  };
}

export type CleanVendorContact = {
  id: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  isPrimary: boolean;
};

/**
 * Sanitize contact rows and enforce AT MOST ONE primary (first flagged primary wins; the rest demote). A row
 * with no name is dropped (empty form rows). Returns rows + the first validation error (null if OK). Pure.
 */
export function sanitizeVendorContacts(contacts: VendorContactInput[] | undefined): {
  rows: CleanVendorContact[];
  error: string | null;
} {
  const rows: CleanVendorContact[] = [];
  for (const c of contacts ?? []) {
    const name = trimOrNull(c?.name);
    if (!name) continue; // drop nameless / empty form rows
    const email = trimOrNull(c?.email);
    if (email && !isLikelyEmail(email)) return { rows: [], error: `Contact "${name}" has an invalid email address.` };
    rows.push({
      id: trimOrNull(c?.id) ,
      name,
      role: trimOrNull(c?.role),
      phone: trimOrNull(c?.phone),
      mobile: trimOrNull(c?.mobile),
      email,
      isPrimary: !!c?.isPrimary,
    });
  }
  let primarySeen = false;
  for (const r of rows) {
    if (r.isPrimary && !primarySeen) primarySeen = true;
    else r.isPrimary = false;
  }
  return { rows, error: null };
}

/**
 * Two-directional (substring-either-way) name match used by the assistant vendor resolver — mirrors
 * findEquipmentByName / the material resolver so "Scott" matches "Scott Labs" and vice-versa. Pure. A `#<id>`
 * ref pins that exact vendor (survives a choice-token resume). Returns the matching subset of `all`.
 */
export function matchVendorsByName<T extends { id: string; name: string }>(all: readonly T[], ref: string): T[] {
  const raw = (ref ?? "").trim();
  const idToken = raw.startsWith("#") ? raw.slice(1).replace(/-/g, "").toLowerCase() : null;
  if (idToken) {
    const pinned = all.find((v) => v.id.replace(/-/g, "").toLowerCase() === idToken);
    return pinned ? [pinned] : [];
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = norm(raw);
  if (!needle) return [];
  const exact = all.filter((v) => norm(v.name) === needle);
  if (exact.length) return exact;
  return all.filter((v) => {
    const h = norm(v.name);
    return h && (h.includes(needle) || needle.includes(h));
  });
}

// ── Merge / remove planning (Plan 072) — PURE logic shared by the cores, the UI preview, and tests ──

/**
 * Live reference counts for a vendor, across every table that points at it. Powers the merge impact
 * preview ("N materials, M lots, K bills will move") and the remove guard. `contacts` is informational —
 * contacts cascade on delete and never block a removal (see `vendorHasBlockingReferences`).
 */
export type VendorUsage = {
  materials: number;
  lots: number;
  apEvents: number;
  contacts: number;
};

export type VendorMergeError = "SAME_VENDOR" | "LOSER_IS_UNKNOWN" | "MISSING_LOSER" | "MISSING_SURVIVOR";

/**
 * Pure guard for a merge request. A merge reassigns every reference from the LOSER onto the SURVIVOR and
 * then deletes the loser, so: the two must be distinct, both ids must be present, and the seeded
 * "Unknown / Unspecified" fallback vendor (`unknownVendorId`, where null-vendor references live) can
 * never be the loser. Returns the first error, or null when the merge is allowed.
 */
export function validateVendorMerge(input: {
  loserId: string | null | undefined;
  survivorId: string | null | undefined;
  unknownVendorId?: string | null;
}): VendorMergeError | null {
  const loser = (input.loserId ?? "").trim();
  const survivor = (input.survivorId ?? "").trim();
  if (!loser) return "MISSING_LOSER";
  if (!survivor) return "MISSING_SURVIVOR";
  if (loser === survivor) return "SAME_VENDOR";
  if (input.unknownVendorId && loser === input.unknownVendorId) return "LOSER_IS_UNKNOWN";
  return null;
}

/** User-safe message for a merge validation error (the server maps these to ActionError). */
export function vendorMergeErrorMessage(err: VendorMergeError): string {
  switch (err) {
    case "SAME_VENDOR":
      return "Pick two different vendors to merge.";
    case "LOSER_IS_UNKNOWN":
      return "The “Unknown / Unspecified” vendor can't be merged away — it's the fallback for un-attributed purchases.";
    case "MISSING_LOSER":
    case "MISSING_SURVIVOR":
      return "That vendor no longer exists.";
  }
}

/**
 * Reconcile the QBO `externalVendorId` cache when merging loser → survivor. The survivor's own mapping
 * always wins. If the survivor has no mapping and the loser has one, carry it forward so future A/P
 * posts still land on a mapped QBO vendor (`changed: true`). If BOTH map to DIFFERENT QBO vendors, that
 * is a `conflict` the admin must acknowledge: a local merge does NOT merge the two QBO vendors, and
 * already-posted bills stay in QBO under whichever vendor they posted to. Pure.
 */
export function resolveMergedExternalVendorId(
  survivor: { externalVendorId: string | null },
  loser: { externalVendorId: string | null },
): { value: string | null; changed: boolean; conflict: boolean } {
  const s = survivor.externalVendorId?.trim() || null;
  const l = loser.externalVendorId?.trim() || null;
  if (s && l && s !== l) return { value: s, changed: false, conflict: true };
  if (!s && l) return { value: l, changed: true, conflict: false };
  return { value: s, changed: false, conflict: false };
}

/**
 * True when a vendor is referenced by real inventory/accounting rows (materials, supply lots, or A/P
 * export events) and therefore can't be hard-removed — the caller should archive it or merge it into
 * another vendor instead. Contacts alone don't block: they CASCADE-delete with the vendor.
 */
export function vendorHasBlockingReferences(usage: VendorUsage): boolean {
  return usage.materials > 0 || usage.lots > 0 || usage.apEvents > 0;
}

// ── Near-duplicate vendor guard (Plan 074) — deterministic, pure, choke-point-shared ──
//
// Prevents spelling-variant dupes at CREATE time ("Scott Labs"/"Scott Laboratories",
// "Crush2Cellar"/"Crush to Cellar") that QBO's exact-DisplayName-only uniqueness won't catch.
// Canonicalizes a name to order-insensitive token keys, then bands the match. ADVISORY — a
// "did you mean?" hint, never an auto-merge (money path; merge stays admin-gated).

/** Length of the shared leading run of two strings. */
function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Tenant-currency codes (Plan 037/073). A trailing "(EUR)" etc. is a QBO DisplayName artifact, not a
 *  meaningful name difference — two names differing ONLY by such a suffix are the SAME vendor (D-note). */
const CURRENCY_CODES = new Set(["usd", "eur", "nzd", "aud", "zar", "gbp", "cad", "chf", "jpy"]);
/** Entity/legal-form noise words dropped before comparison ("Gusmer" ≈ "Gusmer Enterprises"). */
const LEGAL_SUFFIX_TOKENS = new Set([
  "inc", "incorporated", "llc", "co", "corp", "corporation", "ltd", "limited", "company", "enterprises", "gmbh",
]);
/** Abbreviation/synonym folding so "Labs" and "Laboratories" collapse to one key. */
const TOKEN_SYNONYMS: Record<string, string> = { laboratories: "labs", laboratory: "labs", lab: "labs" };
/** Infix digit homophones ("crush2cellar" → "crushtocellar"). Only substituted BETWEEN two letters,
 *  so "3M" / "G3" (digit at an edge) are never mangled. */
const DIGIT_HOMOPHONES: Record<string, string> = { "2": "to", "4": "for", "8": "ate" };

/** Strip a trailing "(EUR)"-style currency suffix. Returns the base name + whether one was present. */
export function stripVendorCurrencySuffix(name: string): { base: string; had: boolean } {
  const m = name.match(/^(.*?)\s*\(([A-Za-z]{3})\)\s*$/);
  if (m && CURRENCY_CODES.has(m[2].toLowerCase())) return { base: m[1].trim(), had: true };
  return { base: name.trim(), had: false };
}

/** Canonical token list for comparison: accent-folded (Château→Chateau), currency-stripped, &→and,
 *  infix-homophone, legal-suffix-dropped, synonym-folded, UNICODE-punctuation-split (so accented and
 *  non-Latin/CJK names tokenize instead of degrading to empty). Falls back to the pre-drop tokens if
 *  dropping legal words empties it (a vendor literally named "Company" keeps its token). Pure. */
function vendorNameTokens(name: string): string[] {
  let s = stripVendorCurrencySuffix(name).base
    .normalize("NFKD").replace(/\p{Diacritic}/gu, "") // fold accents so "Château" ≈ "Chateau"
    .toLowerCase();
  s = s.replace(/&/g, " and ");
  for (const [d, word] of Object.entries(DIGIT_HOMOPHONES)) {
    s = s.replace(new RegExp(`(?<=\\p{L})${d}(?=\\p{L})`, "gu"), word);
  }
  const raw = s.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((t) => TOKEN_SYNONYMS[t] ?? t);
  const dropped = raw.filter((t) => !LEGAL_SUFFIX_TOKENS.has(t));
  return dropped.length ? dropped : raw;
}

/** Order-sensitive + order-insensitive canonical keys for a name, plus the token count. */
function vendorNameKeys(name: string): { ordered: string; sorted: string; count: number } {
  const tokens = vendorNameTokens(name);
  return { ordered: tokens.join(""), sorted: [...tokens].sort().join(""), count: tokens.length };
}

export type VendorMatchLevel = "high" | "medium" | null;

const HIGH_SIM = 0.91; // edit-distance floor for a HIGH (soft-block) match — above 0.90 so a single
                       // one-character difference in a short two-word name ("Hill Family"/"Hall Family",
                       // 1 edit / 10 chars = 0.90) lands in MEDIUM; longer names with a typo still clear it
const MED_SIM = 0.74; // …and for a MEDIUM (suggestion) match

/**
 * How strongly two vendor names look like the same supplier. Takes RAW names (canonicalizes internally).
 *  - `null`: distinct, or they differ ONLY by a currency suffix (same vendor — never flag, protects Plan 073 FX).
 *  - `"high"`: canonical keys collide (exact/word-order/abbrev/homophone), a strong prefix run, or high edit-similarity.
 *  - `"medium"`: related-but-not-sure edit-similarity — surface as a suggestion, don't soft-block.
 * Pure. Conservative by design — advisory, never an auto-merge.
 */
export function nearDuplicateLevel(a: string, b: string): VendorMatchLevel {
  if (!a || !b) return null;
  // Same vendor under two currency labels ("Acme" vs "Acme (EUR)") — not an accidental duplicate.
  const sa = stripVendorCurrencySuffix(a);
  const sb = stripVendorCurrencySuffix(b);
  if ((sa.had || sb.had) && sa.base.toLowerCase() === sb.base.toLowerCase()) return null;

  const ka = vendorNameKeys(a);
  const kb = vendorNameKeys(b);
  if (!ka.ordered || !kb.ordered) return null;
  if (ka.ordered === kb.ordered || ka.sorted === kb.sorted) return "high";

  // Abbreviation-by-truncation with a shared leading run ("Scott Analytical"/"Scott Analytics"). Gated on
  // the shorter side having ≥2 tokens so a bare first word ("Napa" vs "Napa Valley Barrel Co") does NOT
  // soft-block — that lands in MEDIUM via edit-similarity instead. Single-token exact-key matches (Gusmer /
  // Gusmer Enterprises, once the legal suffix is dropped) are already caught by the equal-key check above.
  const lcp = commonPrefixLen(ka.ordered, kb.ordered);
  if (lcp >= 4 && lcp >= 0.6 * Math.min(ka.ordered.length, kb.ordered.length) && Math.min(ka.count, kb.count) >= 2) {
    return "high";
  }

  const s = Math.max(similarity(ka.ordered, kb.ordered), similarity(ka.sorted, kb.sorted));
  if (s >= HIGH_SIM) return "high";
  if (s >= MED_SIM) return "medium";
  return null;
}

/**
 * True when two vendor names are HIGH-confidence the same supplier. Back-compat wrapper (now takes RAW
 * names). Powers `findDuplicateVendorGroups`. Conservative — a hint, not an auto-merge. Pure.
 */
export function vendorNamesLookDuplicate(a: string, b: string): boolean {
  return nearDuplicateLevel(a, b) === "high";
}

/**
 * Banded near-matches for a candidate `name` among existing `vendors`. Skips the seeded Unknown fallback
 * and blank names. `high` = soft-block "did you mean?", `medium` = softer suggestion. Pure — the caller
 * loads the tenant's active vendors and decides UX. Never mutates, never auto-merges.
 */
export function findVendorNearMatches<T extends { id: string; name: string }>(
  name: string,
  vendors: readonly T[],
): { high: T[]; medium: T[] } {
  const high: T[] = [];
  const medium: T[] = [];
  const ref = (name ?? "").trim().slice(0, 200); // cap: bound the O(candidate·stored) edit-distance work
  if (!ref) return { high, medium };
  for (const v of vendors) {
    if (!v?.name || v.name === UNKNOWN_VENDOR_NAME) continue;
    const level = nearDuplicateLevel(ref, v.name);
    if (level === "high") high.push(v);
    else if (level === "medium") medium.push(v);
  }
  return { high, medium };
}

/**
 * Group ACTIVE vendors that look like duplicates of each other (case/punctuation/whitespace/abbreviation/
 * word-order-insensitive, currency-suffix-safe). Powers the assistant's "you may have duplicate vendors"
 * hint. Pure; returns groups of 2+ (each vendor lands in at most one group, anchored on first occurrence).
 */
export function findDuplicateVendorGroups<T extends { id: string; name: string }>(vendors: readonly T[]): T[][] {
  const eligible = vendors.filter((v) => v?.name && v.name.trim() && v.name !== UNKNOWN_VENDOR_NAME);
  const used = new Set<string>();
  const groups: T[][] = [];
  for (let i = 0; i < eligible.length; i++) {
    if (used.has(eligible[i].id)) continue;
    const group = [eligible[i]];
    for (let j = i + 1; j < eligible.length; j++) {
      if (used.has(eligible[j].id)) continue;
      if (nearDuplicateLevel(eligible[i].name, eligible[j].name) === "high") {
        group.push(eligible[j]);
        used.add(eligible[j].id);
      }
    }
    if (group.length > 1) { used.add(eligible[i].id); groups.push(group); }
  }
  return groups;
}

/** Human summary of what a merge will move, for the confirm preview / audit / assistant message. */
export function describeVendorUsage(usage: VendorUsage): string {
  const parts: string[] = [];
  if (usage.materials) parts.push(`${usage.materials} material${usage.materials === 1 ? "" : "s"}`);
  if (usage.lots) parts.push(`${usage.lots} supply lot${usage.lots === 1 ? "" : "s"}`);
  if (usage.apEvents) parts.push(`${usage.apEvents} A/P bill${usage.apEvents === 1 ? "" : "s"}`);
  if (usage.contacts) parts.push(`${usage.contacts} contact${usage.contacts === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "nothing";
}
