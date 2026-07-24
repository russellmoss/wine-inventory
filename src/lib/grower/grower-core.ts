import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { GrowerRow, GrowerContactRow } from "@/lib/grower/data";
import { trimOrNull, isLikelyEmail } from "@/lib/vendors/vendors-shared";
import {
  sanitizeGrower,
  sanitizeGrowerContacts,
  type GrowerInput,
  type GrowerContactInput,
} from "@/lib/grower/grower-shared";

// Plan 093 Unit 8 / Plan 095: the write layer for Grower. Discriminated result (not a thrown ActionError —
// redacted in prod). Per-tenant name uniqueness enforced by the DB @@unique; pre-checked + P2002-caught.
// Plan 095 decision (context-ledger, `grower` domain): a THIRD-PARTY grower is paid like a vendor, so on
// create it LINKS to a Vendor (link-if-name-exists, else create one) via `vendorId` — the QBO push of that
// vendor is layered on in the server action (post-commit, best-effort). An ESTATE grower (isEstate) gets NO
// vendor link (you don't pay yourself). tenantId is passed explicitly on createMany (the extension doesn't
// auto-inject there — mirrors createVendorCore).

export const MAX_GROWER_NAME = 120;

const GROWER_SELECT = {
  id: true, name: true, company: true, contact: true, contactName: true, phone: true, email: true,
  address: true, vendorId: true, isEstate: true, isActive: true,
} as const;
const CONTACT_SELECT = {
  id: true, growerId: true, name: true, role: true, phone: true, mobile: true, email: true, isPrimary: true,
} as const;

export type CreateGrowerInput = GrowerInput;
export type CreateGrowerResult = { ok: true; grower: GrowerRow } | { ok: false; error: string };

function toRow(r: Omit<GrowerRow, "contacts">, contacts: GrowerContactRow[]): GrowerRow {
  return { ...r, contacts };
}

const isP2002 = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Link (or create) the Vendor a third-party grower is paid through. Link-if-name-exists so we never
 *  duplicate a vendor the winery already bills; a brand-new vendor carries the grower's contact fields so
 *  QBO has them. Estate growers never reach this. Runs inside the caller's tenant tx. */
async function linkGrowerVendor(
  tx: Prisma.TransactionClient,
  tenantId: string,
  fields: { name: string; phone: string | null; email: string | null; contactName: string | null },
): Promise<string> {
  const existing = await tx.vendor.findFirst({ where: { name: fields.name }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.vendor.create({
    data: { tenantId, name: fields.name, phone: fields.phone, email: fields.email, contactName: fields.contactName },
    select: { id: true },
  });
  return created.id;
}

/** Create a Grower for the current tenant (structured contacts + third-party vendor link). */
export async function createGrowerCore(actor: LedgerActor, input: CreateGrowerInput, injectedTx?: Prisma.TransactionClient): Promise<CreateGrowerResult> {
  const { fields, error } = sanitizeGrower(input);
  if (error || !fields) return { ok: false, error: error ?? "Enter a name for the grower." };
  if (fields.name.length > MAX_GROWER_NAME) return { ok: false, error: `Grower name is too long (max ${MAX_GROWER_NAME} characters).` };
  const { rows: contacts, error: cErr } = sanitizeGrowerContacts(input.contacts);
  if (cErr) return { ok: false, error: cErr };

  const body = async (tx: Prisma.TransactionClient): Promise<CreateGrowerResult> => {
    const clash = await tx.grower.findFirst({ where: { name: fields.name }, select: { id: true } });
    if (clash) return { ok: false, error: `You already have a grower called "${fields.name}".` };
    const tenantId = requireTenantId();
    try {
      const vendorId = fields.isEstate ? null : await linkGrowerVendor(tx, tenantId, fields);
      const row = await tx.grower.create({
        data: {
          tenantId,
          name: fields.name,
          company: fields.company,
          contactName: fields.contactName,
          phone: fields.phone,
          email: fields.email,
          address: fields.address,
          isEstate: fields.isEstate,
          vendorId,
        },
        select: GROWER_SELECT,
      });
      if (contacts.length) {
        await tx.growerContact.createMany({
          data: contacts.map((c) => ({
            tenantId, growerId: row.id, name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary,
          })),
        });
      }
      const contactRows = await tx.growerContact.findMany({ where: { growerId: row.id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }], select: CONTACT_SELECT });
      await writeAudit(tx, {
        ...actor, action: "CREATE", entityType: "Grower", entityId: row.id,
        summary: `Created grower "${fields.name}"${fields.isEstate ? " (estate)" : vendorId ? " (+ vendor)" : ""}`,
      });
      return { ok: true, grower: toRow(row, contactRows) };
    } catch (e) {
      if (isP2002(e)) return { ok: false, error: `You already have a grower called "${fields.name}".` };
      throw e;
    }
  };

  return injectedTx ? body(injectedTx) : runInTenantTx(body);
}

export type UpdateGrowerInput = {
  id: string;
  name?: string;
  company?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isEstate?: boolean | null;
  isActive?: boolean;
  contacts?: GrowerContactInput[];
};

/** Edit a grower (rename / details / estate flag / deactivate / contacts). Deactivate is soft — vineyards/
 *  blocks and weigh-tag lines reference growers (FK RESTRICT), so a grower in use can't be deleted. A grower
 *  that becomes non-estate and isn't yet linked to a vendor gets one linked here (link-if-name-exists); the
 *  linked vendor is NEVER renamed or unlinked from here (vendor lifecycle stays an admin concern). */
export async function updateGrowerCore(actor: LedgerActor, input: UpdateGrowerInput): Promise<CreateGrowerResult> {
  const data: {
    name?: string; company?: string | null; contactName?: string | null; phone?: string | null;
    email?: string | null; address?: string | null; isEstate?: boolean; isActive?: boolean; vendorId?: string | null;
  } = {};
  if (input.name != null) {
    const name = String(input.name).trim();
    if (!name) return { ok: false, error: "Enter a name for the grower." };
    if (name.length > MAX_GROWER_NAME) return { ok: false, error: `Grower name is too long (max ${MAX_GROWER_NAME} characters).` };
    data.name = name;
  }
  if (input.company !== undefined) data.company = trimOrNull(input.company);
  if (input.contactName !== undefined) data.contactName = trimOrNull(input.contactName);
  if (input.phone !== undefined) data.phone = trimOrNull(input.phone);
  if (input.email !== undefined) {
    const email = trimOrNull(input.email);
    if (email && !isLikelyEmail(email)) return { ok: false, error: "That grower email address doesn't look right." };
    data.email = email;
  }
  if (input.address !== undefined) data.address = trimOrNull(input.address, 300);
  if (input.isEstate != null) data.isEstate = input.isEstate;
  if (input.isActive != null) data.isActive = input.isActive;

  const { rows: contacts, error: cErr } = sanitizeGrowerContacts(input.contacts);
  if (cErr) return { ok: false, error: cErr };

  return runInTenantTx(async (tx) => {
    const existing = await tx.grower.findUnique({ where: { id: input.id }, select: { id: true, name: true, isEstate: true, vendorId: true } });
    if (!existing) return { ok: false, error: "That grower no longer exists." };
    const tenantId = requireTenantId();

    // Link a vendor when the grower ends up third-party and isn't linked yet.
    const resultingEstate = input.isEstate != null ? input.isEstate : existing.isEstate;
    if (!resultingEstate && !existing.vendorId) {
      const name = data.name ?? existing.name;
      data.vendorId = await linkGrowerVendor(tx, tenantId, {
        name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        contactName: data.contactName ?? null,
      });
    }

    try {
      await tx.grower.update({ where: { id: input.id }, data });
    } catch (e) {
      if (isP2002(e)) return { ok: false, error: `You already have a grower called "${data.name}".` };
      throw e;
    }

    // Reconcile contacts only when the caller sent the array (undefined = leave contacts untouched).
    if (input.contacts !== undefined) {
      const current = await tx.growerContact.findMany({ where: { growerId: input.id }, select: { id: true } });
      const keepIds = new Set(contacts.map((c) => c.id).filter((x): x is string => !!x));
      const toDelete = current.filter((c) => !keepIds.has(c.id)).map((c) => c.id);
      if (toDelete.length) await tx.growerContact.deleteMany({ where: { id: { in: toDelete } } });
      for (const c of contacts) {
        if (c.id && current.some((x) => x.id === c.id)) {
          await tx.growerContact.update({
            where: { id: c.id },
            data: { name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary },
          });
        } else {
          await tx.growerContact.create({
            data: { tenantId, growerId: input.id, name: c.name, role: c.role, phone: c.phone, mobile: c.mobile, email: c.email, isPrimary: c.isPrimary },
          });
        }
      }
    }

    const row = await tx.grower.findUniqueOrThrow({ where: { id: input.id }, select: GROWER_SELECT });
    const contactRows = await tx.growerContact.findMany({ where: { growerId: input.id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }], select: CONTACT_SELECT });
    await writeAudit(tx, {
      ...actor, action: "UPDATE", entityType: "Grower", entityId: input.id,
      summary: `Updated grower "${row.name}"${input.isActive === false ? " (deactivated)" : input.isActive === true ? " (reactivated)" : ""}`,
    });
    return { ok: true, grower: toRow(row, contactRows) };
  });
}
