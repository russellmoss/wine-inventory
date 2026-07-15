import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import {
  sanitizeVendor,
  sanitizeVendorContacts,
  normalizeVendorUrl,
  matchVendorsByName,
  UNKNOWN_VENDOR_NAME,
  type VendorInput,
  type VendorRow,
  type VendorContactRow,
} from "@/lib/vendors/vendors-shared";

// Plan 069: the managed-vendor data layer. Reuses the existing (Phase 15 QBO) `vendor` table + the new
// `vendor_contact` child. The client-safe vocab + pure sanitizers live in ./vendors-shared (re-exported here
// for server call sites). find-or-create is shared with the A/P emit path so both dedup vendors identically.
export {
  PAYMENT_TERMS_SUGGESTIONS,
  UNKNOWN_VENDOR_NAME,
  sanitizeVendor,
  sanitizeVendorContacts,
  matchVendorsByName,
} from "@/lib/vendors/vendors-shared";
export type { VendorInput, VendorContactInput, VendorRow, VendorContactRow } from "@/lib/vendors/vendors-shared";

type Db = Prisma.TransactionClient;
const asDb = (db?: Db): Db => db ?? (prisma as unknown as Db);

const VENDOR_SELECT = {
  id: true, name: true, phone: true, email: true, contactName: true,
  accountNumber: true, poRequired: true, terms: true, url: true, notes: true, isActive: true,
} as const;
const CONTACT_SELECT = {
  id: true, vendorId: true, name: true, role: true, phone: true, mobile: true, email: true, isPrimary: true,
} as const;

/**
 * Find-or-create a vendor by name within the current tenant. Reused by A/P emit (ap-emit.ts), supply-lot
 * intake, and the backfill script so they all dedup vendors identically (one `vendor` per tenant+name). The
 * tenant extension auto-injects tenantId on create; findFirst is RLS-scoped. Blank name → null (no-op).
 */
export async function findOrCreateVendorCore(
  input: { name: string; terms?: string | null; url?: string | null },
  dbArg?: Db,
): Promise<{ id: string } | null> {
  const name = input.name?.trim();
  if (!name) return null;
  const db = asDb(dbArg);
  const existing = await db.vendor.findFirst({ where: { name }, select: { id: true } });
  if (existing) return existing;
  return db.vendor.create({
    data: { name, terms: input.terms?.trim() || null, url: normalizeVendorUrl(input.url) },
    select: { id: true },
  });
}

/** Get-or-create the seeded per-tenant "Unknown / Unspecified" vendor (the UI-required fallback). */
export async function ensureUnknownVendor(dbArg?: Db): Promise<{ id: string }> {
  const v = await findOrCreateVendorCore({ name: UNKNOWN_VENDOR_NAME }, dbArg);
  // name is a non-empty constant, so findOrCreateVendorCore never returns null here.
  return v as { id: string };
}

export async function createVendorCore(actor: LedgerActor, input: VendorInput): Promise<{ id: string }> {
  const { fields, error } = sanitizeVendor(input);
  if (error || !fields) throw new ActionError(error ?? "Invalid vendor.");
  const { rows: contacts, error: cErr } = sanitizeVendorContacts(input.contacts);
  if (cErr) throw new ActionError(cErr);
  try {
    return await runInTenantTx(async (tx) => {
      const tenantId = requireTenantId();
      const row = await tx.vendor.create({ data: { tenantId, ...fields }, select: { id: true } });
      if (contacts.length) {
        await tx.vendorContact.createMany({
          data: contacts.map((c) => ({
            tenantId, vendorId: row.id, name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary,
          })),
        });
      }
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Vendor", entityId: row.id, summary: `Added vendor ${fields.name}` });
      return { id: row.id };
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      throw new ActionError(`A vendor named "${fields.name}" already exists.`, "CONFLICT");
    }
    throw e;
  }
}

export async function updateVendorCore(actor: LedgerActor, id: string, input: VendorInput): Promise<{ id: string }> {
  const { fields, error } = sanitizeVendor(input);
  if (error || !fields) throw new ActionError(error ?? "Invalid vendor.");
  const { rows: contacts, error: cErr } = sanitizeVendorContacts(input.contacts);
  if (cErr) throw new ActionError(cErr);
  return runInTenantTx(async (tx) => {
    const existing = await tx.vendor.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new ActionError("That vendor no longer exists.");
    const tenantId = requireTenantId();
    try {
      await tx.vendor.update({ where: { id }, data: fields });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        throw new ActionError(`A vendor named "${fields.name}" already exists.`, "CONFLICT");
      }
      throw e;
    }
    // Reconcile contacts only when the caller sent the array (undefined = leave contacts untouched).
    if (input.contacts !== undefined) {
      const current = await tx.vendorContact.findMany({ where: { vendorId: id }, select: { id: true } });
      const keepIds = new Set(contacts.map((c) => c.id).filter((x): x is string => !!x));
      const toDelete = current.filter((c) => !keepIds.has(c.id)).map((c) => c.id);
      if (toDelete.length) await tx.vendorContact.deleteMany({ where: { id: { in: toDelete } } });
      for (const c of contacts) {
        if (c.id && current.some((x) => x.id === c.id)) {
          await tx.vendorContact.update({
            where: { id: c.id },
            data: { name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary },
          });
        } else {
          await tx.vendorContact.create({
            data: { tenantId, vendorId: id, name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary },
          });
        }
      }
    }
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "Vendor", entityId: id, summary: `Updated vendor ${fields.name}` });
    return { id };
  });
}

export async function archiveVendorCore(actor: LedgerActor, id: string, active: boolean): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const existing = await tx.vendor.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw new ActionError("That vendor no longer exists.");
    await tx.vendor.update({ where: { id }, data: { isActive: active } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "Vendor", entityId: id, summary: active ? `Restored vendor ${existing.name}` : `Archived vendor ${existing.name}` });
    return { id };
  });
}

/** All vendors (active first) with their contacts. Tenant scoping is automatic (RLS + extension); pass an
 *  explicit tenantId (wraps in runAsTenant) for scripts / the assistant resolver outside a request context. */
export async function listVendors(opts?: { activeOnly?: boolean; tenantId?: string }): Promise<VendorRow[]> {
  const run = async (): Promise<VendorRow[]> => {
    const rows = await prisma.vendor.findMany({
      where: opts?.activeOnly ? { isActive: true } : {},
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: VENDOR_SELECT,
    });
    if (rows.length === 0) return [];
    const contacts = await prisma.vendorContact.findMany({
      where: { vendorId: { in: rows.map((r) => r.id) } },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      select: CONTACT_SELECT,
    });
    const byVendor = new Map<string, VendorContactRow[]>();
    for (const c of contacts) {
      const arr = byVendor.get(c.vendorId) ?? [];
      arr.push(c);
      byVendor.set(c.vendorId, arr);
    }
    return rows.map((r) => ({ ...r, contacts: byVendor.get(r.id) ?? [] }));
  };
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}

/** Fuzzy-match ACTIVE vendors by name for the assistant resolver (two-directional substring; `#id` pins).
 *  Never invents an id — returns candidates so the tool can pin one, show a choice, or report none. K12-safe. */
export async function findVendorsByName(tenantId: string, ref: string): Promise<VendorRow[]> {
  const all = await listVendors({ activeOnly: true, tenantId });
  return matchVendorsByName(all, ref);
}
