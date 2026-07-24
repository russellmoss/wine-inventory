import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { runAsTenant } from "@/lib/tenant/context";
import { matchVendorsByName } from "@/lib/vendors/vendors-shared"; // generic {id,name} matcher (not vendor-specific state)
import { findGrowerNearMatches, type GrowerContactRow } from "@/lib/grower/grower-shared";

// Plan 093 Unit 8 / Plan 095: the read/pure layer for the first-class Grower — the party that FARMED the
// fruit (distinct from Owner, who OWNS the wine). Plan 095 brings it to Vendor parity: structured contact
// fields, additional contacts (grower_contact), and an optional vendorId link (a third-party grower is paid
// like a vendor). The legacy free-text `contact` is retained for provenance but no longer written.

export type { GrowerContactRow } from "@/lib/grower/grower-shared";

export type GrowerRow = {
  id: string;
  name: string;
  company: string | null;
  contact: string | null; // LEGACY free-text (retained, no longer written — superseded by the structured fields)
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  vendorId: string | null; // linked Vendor (third-party growers); NULL for estate
  isEstate: boolean;
  isActive: boolean;
  contacts: GrowerContactRow[];
};

type Db = Prisma.TransactionClient;
const asDb = (db?: Db): Db => db ?? (prisma as unknown as Db);

const GROWER_SELECT = {
  id: true, name: true, company: true, contact: true, contactName: true, phone: true, email: true,
  address: true, vendorId: true, isEstate: true, isActive: true,
} as const;
const CONTACT_SELECT = {
  id: true, growerId: true, name: true, role: true, phone: true, mobile: true, email: true, isPrimary: true,
} as const;

type GrowerScalar = Omit<GrowerRow, "contacts">;

function toRow(r: GrowerScalar, contacts: GrowerContactRow[]): GrowerRow {
  return { ...r, contacts };
}

/** Group contact rows by their growerId (primary first, then name). */
function groupContacts(contacts: GrowerContactRow[]): Map<string, GrowerContactRow[]> {
  const byGrower = new Map<string, GrowerContactRow[]>();
  for (const c of contacts) {
    const arr = byGrower.get(c.growerId) ?? [];
    arr.push(c);
    byGrower.set(c.growerId, arr);
  }
  return byGrower;
}

/** How a grower renders in any human-facing surface. A NULL grower is unassigned (not "estate" — estate is
 *  a real Grower flagged isEstate). Never surfaces blank. */
export function growerLabel(grower: Pick<GrowerRow, "name"> | null | undefined): string {
  return grower?.name ?? "Unassigned grower";
}

/** List the current tenant's growers (name-sorted) with their additional contacts. Reads via the extended
 *  `prisma` (session tenant). */
export async function listGrowersCore(injectedTx?: Db): Promise<GrowerRow[]> {
  const db = asDb(injectedTx);
  const rows = await db.grower.findMany({ orderBy: { name: "asc" }, select: GROWER_SELECT });
  if (rows.length === 0) return [];
  const contacts = await db.growerContact.findMany({
    where: { growerId: { in: rows.map((r) => r.id) } },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: CONTACT_SELECT,
  });
  const byGrower = groupContacts(contacts);
  return rows.map((r) => toRow(r, byGrower.get(r.id) ?? []));
}

/** Resolve a single grower by id (tenant-scoped) with its contacts. Null for a missing/absent id. */
export async function getGrowerCore(growerId: string | null | undefined, injectedTx?: Db): Promise<GrowerRow | null> {
  if (!growerId) return null;
  const db = asDb(injectedTx);
  const row = await db.grower.findUnique({ where: { id: growerId }, select: GROWER_SELECT });
  if (!row) return null;
  const contacts = await db.growerContact.findMany({
    where: { growerId },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: CONTACT_SELECT,
  });
  return toRow(row, contacts);
}

/**
 * Fuzzy-match ACTIVE growers by name for the assistant resolver / create-time dedup (two-directional
 * substring; `#id` pins). Never invents an id — returns candidates so the tool can pin one, show a choice,
 * or report none. Pass tenantId (wraps in runAsTenant) since the assistant runs outside a request ALS scope.
 */
export async function findGrowersByName(tenantId: string, ref: string): Promise<GrowerRow[]> {
  return runAsTenant(tenantId, async () => {
    const all = (await listGrowersCore()).filter((g) => g.isActive);
    return matchVendorsByName(all, ref);
  });
}

export type GrowerNearMatch = { id: string; name: string };

/**
 * Banded near-duplicate matches for a candidate grower `name` within the current tenant. Reads ACTIVE
 * growers and delegates to the pure `findGrowerNearMatches` engine. Read-only, no audit — the create-time
 * "did you mean?" guard for the setup modal + assistant. Pass opts.tenantId to wrap in runAsTenant (assistant
 * / scripts outside a request context).
 */
export async function getGrowerNearMatchesCore(
  name: string,
  opts?: { tenantId?: string },
): Promise<{ high: GrowerNearMatch[]; medium: GrowerNearMatch[] }> {
  const run = async () => {
    const ref = (name ?? "").trim();
    if (!ref) return { high: [], medium: [] };
    const growers = await asDb().grower.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    return findGrowerNearMatches(ref, growers);
  };
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}
