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
  validateVendorMerge,
  vendorMergeErrorMessage,
  resolveMergedExternalVendorId,
  vendorHasBlockingReferences,
  describeVendorUsage,
  UNKNOWN_VENDOR_NAME,
  type VendorInput,
  type VendorRow,
  type VendorContactRow,
  type VendorUsage,
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

// ── Plan 072: vendor merge + removal ──

/** Count every reference to a vendor (RLS-scoped). Shared inner used by the tx core + the public loader. */
async function countVendorUsage(db: Db, id: string): Promise<VendorUsage> {
  const [materials, lots, apEvents, contacts] = await Promise.all([
    db.cellarMaterial.count({ where: { vendorId: id } }),
    db.supplyLot.count({ where: { vendorId: id } }),
    db.apExportEvent.count({ where: { vendorId: id } }),
    db.vendorContact.count({ where: { vendorId: id } }),
  ]);
  return { materials, lots, apEvents, contacts };
}

/**
 * How many materials, supply lots, A/P bills, and contacts point at this vendor. Powers the merge
 * impact preview and the remove guard. Tenant scoping is automatic (RLS + extension); pass an explicit
 * tenantId (wraps in runAsTenant) for scripts / the assistant outside a request context.
 */
export async function getVendorUsage(id: string, opts?: { tenantId?: string }): Promise<VendorUsage> {
  const run = () => countVendorUsage(asDb(), id);
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}

/**
 * Merge the LOSER vendor into the SURVIVOR: re-point every reference (materials, supply lots, A/P export
 * events, contacts) from loser → survivor, then hard-delete the loser. One atomic tenant tx, so it's
 * all-or-nothing — a governed-money op (`ap_export_event` is the posted-bill reference, RESTRICT-guarded
 * at the DB, which is exactly why we re-point rather than orphan). The event stays immutable: only its
 * `vendorId` pointer moves, never amounts/accounts.
 *
 * QBO: the survivor's `externalVendorId` wins; if it's unmapped we carry the loser's forward. If BOTH
 * map to DIFFERENT QBO vendors it's a conflict that requires `acknowledgeQboConflict` (a local merge
 * does NOT merge the two QBO vendors — already-posted bills stay under the old one; recommend accountant
 * review). The seeded "Unknown / Unspecified" fallback can never be the loser.
 */
export async function mergeVendorsCore(
  actor: LedgerActor,
  input: { loserId: string; survivorId: string; acknowledgeQboConflict?: boolean },
): Promise<{ survivorId: string; moved: VendorUsage; qboConflictAcknowledged: boolean }> {
  const { loserId, survivorId } = input;
  const shapeErr = validateVendorMerge({ loserId, survivorId });
  if (shapeErr) throw new ActionError(vendorMergeErrorMessage(shapeErr), "VALIDATION");

  return runInTenantTx(async (tx) => {
    const sel = { id: true, name: true, url: true, externalVendorId: true } as const;
    const [loser, survivor] = await Promise.all([
      tx.vendor.findUnique({ where: { id: loserId }, select: sel }),
      tx.vendor.findUnique({ where: { id: survivorId }, select: sel }),
    ]);
    if (!loser || !survivor) throw new ActionError("That vendor no longer exists.", "VALIDATION");
    if (loser.name === UNKNOWN_VENDOR_NAME) {
      throw new ActionError(vendorMergeErrorMessage("LOSER_IS_UNKNOWN"), "VALIDATION");
    }

    const qbo = resolveMergedExternalVendorId(survivor, loser);
    if (qbo.conflict && !input.acknowledgeQboConflict) {
      throw new ActionError(
        `"${loser.name}" and "${survivor.name}" are linked to different QuickBooks vendors. Merging locally ` +
          `won't merge them in QuickBooks — already-posted bills stay under the old QuickBooks vendor. ` +
          `Confirm you understand (and consider merging them in QuickBooks too) to proceed.`,
        "CONFLICT",
      );
    }

    const moved = await countVendorUsage(tx, loserId);

    // Re-point + (for materials) re-derive the legacy vendor/vendorUrl mirror to the survivor in one pass.
    await tx.cellarMaterial.updateMany({
      where: { vendorId: loserId },
      data: { vendorId: survivorId, vendor: survivor.name, vendorUrl: survivor.url },
    });
    await tx.supplyLot.updateMany({ where: { vendorId: loserId }, data: { vendorId: survivorId } });
    await tx.apExportEvent.updateMany({ where: { vendorId: loserId }, data: { vendorId: survivorId } });
    await tx.vendorContact.updateMany({ where: { vendorId: loserId }, data: { vendorId: survivorId } });

    if (qbo.changed) {
      await tx.vendor.update({ where: { id: survivorId }, data: { externalVendorId: qbo.value } });
    }

    await tx.vendor.delete({ where: { id: loserId } });

    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "Vendor",
      entityId: loserId,
      summary:
        `Merged vendor ${loser.name} → ${survivor.name} (moved ${describeVendorUsage(moved)})` +
        (qbo.conflict ? " · QBO-mapping conflict acknowledged" : "") +
        (qbo.changed ? " · carried QBO mapping forward" : ""),
    });

    return { survivorId, moved, qboConflictAcknowledged: qbo.conflict };
  });
}

/**
 * Hard-delete a vendor — but ONLY when nothing references it (its contacts CASCADE away with it). A
 * vendor used by any material, supply lot, or A/P bill can't be deleted (the DB RESTRICTs it, which
 * protects accounting history); we surface that as a clear CONFLICT telling the admin to archive or
 * merge instead, never a raw 500. The seeded "Unknown / Unspecified" fallback can't be removed.
 */
export async function removeVendorCore(actor: LedgerActor, id: string): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const existing = await tx.vendor.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw new ActionError("That vendor no longer exists.", "VALIDATION");
    if (existing.name === UNKNOWN_VENDOR_NAME) {
      throw new ActionError(
        "The “Unknown / Unspecified” vendor can't be removed — it's the fallback for un-attributed purchases.",
        "CONFLICT",
      );
    }
    const usage = await countVendorUsage(tx, id);
    if (vendorHasBlockingReferences(usage)) {
      throw new ActionError(
        `"${existing.name}" is used by ${describeVendorUsage({ ...usage, contacts: 0 })} — archive it or ` +
          `merge it into another vendor instead of removing it.`,
        "CONFLICT",
      );
    }
    await tx.vendor.delete({ where: { id } }); // contacts (if any) cascade
    await writeAudit(tx, { ...actor, action: "DELETE", entityType: "Vendor", entityId: id, summary: `Removed vendor ${existing.name}` });
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
