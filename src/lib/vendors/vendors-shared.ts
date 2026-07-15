// Plan 069: client-safe vendor vocabulary, DTO types, and PURE sanitizers. NO server imports (prisma/tenant/
// audit) live here, so 'use client' components (VendorForm, VendorPicker, /setup/vendors) and unit tests can
// import these without dragging the server data layer into the browser bundle. The server cores in vendors.ts
// wrap these sanitizers (and throw ActionError on the returned `error`).

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
