import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { GrowerRow } from "@/lib/grower/data";

// Plan 093 Unit 8: the write layer for Grower. Discriminated result (not a thrown ActionError — redacted
// in prod). Per-tenant name uniqueness enforced by the DB @@unique; pre-checked + P2002-caught. tenantId
// auto-injected by the extension.

export const MAX_GROWER_NAME = 120;

const GROWER_SELECT = { id: true, name: true, company: true, contact: true, isEstate: true, isActive: true } as const;

export type CreateGrowerInput = {
  name: string;
  company?: string | null;
  contact?: string | null;
  address?: string | null;
  isEstate?: boolean;
};

export type CreateGrowerResult = { ok: true; grower: GrowerRow } | { ok: false; error: string };

function toRow(r: { id: string; name: string; company: string | null; contact: string | null; isEstate: boolean; isActive: boolean }): GrowerRow {
  return { id: r.id, name: r.name, company: r.company, contact: r.contact, isEstate: r.isEstate, isActive: r.isActive };
}

const isP2002 = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Create a Grower for the current tenant. */
export async function createGrowerCore(actor: LedgerActor, input: CreateGrowerInput, injectedTx?: Prisma.TransactionClient): Promise<CreateGrowerResult> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name for the grower." };
  if (name.length > MAX_GROWER_NAME) return { ok: false, error: `Grower name is too long (max ${MAX_GROWER_NAME} characters).` };

  const body = async (tx: Prisma.TransactionClient): Promise<CreateGrowerResult> => {
    const clash = await tx.grower.findFirst({ where: { name }, select: { id: true } });
    if (clash) return { ok: false, error: `You already have a grower called "${name}".` };
    try {
      const row = await tx.grower.create({
        data: {
          name,
          company: input.company?.trim() || null,
          contact: input.contact?.trim() || null,
          address: input.address?.trim() || null,
          isEstate: input.isEstate ?? false,
        },
        select: GROWER_SELECT,
      });
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Grower", entityId: row.id, summary: `Created grower "${name}"${input.isEstate ? " (estate)" : ""}` });
      return { ok: true, grower: toRow(row) };
    } catch (e) {
      if (isP2002(e)) return { ok: false, error: `You already have a grower called "${name}".` };
      throw e;
    }
  };

  return injectedTx ? body(injectedTx) : runInTenantTx(body);
}
