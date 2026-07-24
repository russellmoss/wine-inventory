// Plan 095: client-safe grower vocabulary, DTO types, and PURE sanitizers — mirrors vendors-shared.ts. NO
// server imports (prisma/tenant/audit) live here, so 'use client' components (GrowerForm, /setup/growers)
// and unit tests can import these without dragging the server data layer into the browser bundle. The server
// core in grower-core.ts wraps these sanitizers. Pure helpers (trimOrNull/isLikelyEmail/nearDuplicateLevel)
// are reused from vendors-shared — they're generic name/field logic, not vendor-specific state.

import { isLikelyEmail, nearDuplicateLevel, trimOrNull } from "@/lib/vendors/vendors-shared";

// ── DTO shapes (read side) ──

export type GrowerContactRow = {
  id: string;
  growerId: string;
  name: string;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  isPrimary: boolean;
};

// ── Input shapes (write side) ──

export type GrowerContactInput = {
  /** present → update that existing contact; absent/blank → create a new one. */
  id?: string | null;
  name: string;
  role?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  isPrimary?: boolean | null;
};

export type GrowerInput = {
  name: string;
  company?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isEstate?: boolean | null;
  contacts?: GrowerContactInput[];
};

// ── Pure sanitizers (no throw; the server core returns a discriminated error on `error`) ──

export type CleanGrower = {
  name: string;
  company: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isEstate: boolean;
};

/** Sanitize the grower's own fields. Returns the persisted field set + the first validation error (null if OK). Pure. */
export function sanitizeGrower(input: GrowerInput): { fields: CleanGrower | null; error: string | null } {
  const name = trimOrNull(input?.name);
  if (!name) return { fields: null, error: "Grower needs a name." };
  const email = trimOrNull(input?.email);
  if (email && !isLikelyEmail(email)) return { fields: null, error: "That grower email address doesn't look right." };
  return {
    fields: {
      name,
      company: trimOrNull(input?.company),
      contactName: trimOrNull(input?.contactName),
      phone: trimOrNull(input?.phone),
      email,
      address: trimOrNull(input?.address, 300),
      isEstate: !!input?.isEstate,
    },
    error: null,
  };
}

export type CleanGrowerContact = {
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
 * Same contract as sanitizeVendorContacts.
 */
export function sanitizeGrowerContacts(contacts: GrowerContactInput[] | undefined): {
  rows: CleanGrowerContact[];
  error: string | null;
} {
  const rows: CleanGrowerContact[] = [];
  for (const c of contacts ?? []) {
    const name = trimOrNull(c?.name);
    if (!name) continue; // drop nameless / empty form rows
    const email = trimOrNull(c?.email);
    if (email && !isLikelyEmail(email)) return { rows: [], error: `Contact "${name}" has an invalid email address.` };
    rows.push({
      id: trimOrNull(c?.id),
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
 * Banded near-matches for a candidate grower `name` among existing `growers`. `high` = soft-block
 * "did you mean?", `medium` = softer suggestion. Pure — reuses the vendor near-duplicate scorer (generic
 * company-name logic). The caller loads the tenant's growers and decides UX. Never mutates.
 */
export function findGrowerNearMatches<T extends { id: string; name: string }>(
  name: string,
  growers: readonly T[],
): { high: T[]; medium: T[] } {
  const high: T[] = [];
  const medium: T[] = [];
  const ref = (name ?? "").trim().slice(0, 200); // cap the O(candidate·stored) edit-distance work
  if (!ref) return { high, medium };
  for (const g of growers) {
    if (!g?.name) continue;
    const level = nearDuplicateLevel(ref, g.name);
    if (level === "high") high.push(g);
    else if (level === "medium") medium.push(g);
  }
  return { high, medium };
}
