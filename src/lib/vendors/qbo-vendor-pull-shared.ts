// Plan 075 (QBO vendor sync, Slice 1) — the PURE reconcile at the heart of the pull. Given the QBO vendor list,
// the local vendors, and the rejected-tombstone ids, it decides which QBO vendors are already synced, which are
// suppressed, and which become review-queue candidates (with a suggested local match). No I/O — unit-tested.
// The I/O wrapper (connection/token/listVendors/upsert) lives in the server-only qbo-vendor-pull.ts.

import { stripVendorCurrencySuffix, findVendorNearMatches } from "@/lib/vendors/vendors-shared";

/** One QBO vendor as pulled (NormalizedVendor shape; redeclared here to keep this module server-import-free). */
export type PulledVendor = { externalId: string; name: string; active: boolean };
/** A local vendor, enough to match + detect an existing QBO link. */
export type LocalVendorRef = { id: string; name: string; externalVendorId: string | null };
/** A row to upsert into vendor_import_candidate. */
export type CandidateUpsert = {
  externalVendorId: string; // canonical/base QBO id
  name: string; // collapsed base name (currency suffix stripped)
  suggestedVendorId: string | null; // top HIGH local match, if any
  currencyVariantIds: string[]; // every QBO id collapsed into this candidate (sorted, stable)
};
export type ReconcileResult = { candidates: CandidateUpsert[]; skippedSynced: number; skippedRejected: number };

/**
 * Decide the review-queue candidates for a pulled QBO vendor list. PURE + deterministic (idempotent: same
 * inputs → same output). Rules:
 *  - Collapse currency variants ("Acme" / "Acme (EUR)", Plan 073) into ONE candidate keyed on the stripped base.
 *  - Skip a group if ANY of its QBO ids is already an existing local `Vendor.externalVendorId` (already synced).
 *  - Skip a group if ANY of its QBO ids is a REJECTED tombstone (suppressed on re-pull).
 *  - Otherwise emit a candidate, with `suggestedVendorId` = the top HIGH local name-match (Plan 074), if any.
 *  - Blank-name QBO vendors are ignored.
 * Canonical id = the non-suffixed variant if present, else the lexicographically-smallest id (stable).
 */
export function reconcileQboVendors(
  qbo: readonly PulledVendor[],
  existing: readonly LocalVendorRef[],
  rejectedExternalIds: ReadonlySet<string>,
): ReconcileResult {
  const syncedIds = new Set(existing.map((v) => v.externalVendorId).filter((x): x is string => !!x));

  // Group by the currency-stripped, lowercased base name.
  const groups = new Map<string, PulledVendor[]>();
  for (const v of qbo) {
    const base = stripVendorCurrencySuffix(v.name).base.trim();
    if (!base) continue; // ignore blank-name QBO vendors
    const key = base.toLowerCase();
    const g = groups.get(key);
    if (g) g.push(v);
    else groups.set(key, [v]);
  }

  const candidates: CandidateUpsert[] = [];
  let skippedSynced = 0;
  let skippedRejected = 0;

  for (const group of groups.values()) {
    const variantIds = group.map((v) => v.externalId).sort();
    if (variantIds.some((id) => syncedIds.has(id))) { skippedSynced++; continue; }
    if (variantIds.some((id) => rejectedExternalIds.has(id))) { skippedRejected++; continue; }

    // Canonical member: prefer a non-suffixed name; else the smallest id (deterministic).
    const nonSuffixed = group.filter((v) => !stripVendorCurrencySuffix(v.name).had);
    const canonical = (nonSuffixed.length ? nonSuffixed : group)
      .slice()
      .sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0))[0];
    const name = stripVendorCurrencySuffix(canonical.name).base.trim();

    const { high } = findVendorNearMatches(name, existing);
    candidates.push({
      externalVendorId: canonical.externalId,
      name,
      suggestedVendorId: high[0]?.id ?? null,
      currencyVariantIds: variantIds,
    });
  }

  // Deterministic order (by name then id) so re-runs and tests are stable.
  candidates.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.externalVendorId < b.externalVendorId ? -1 : 1));
  return { candidates, skippedSynced, skippedRejected };
}
