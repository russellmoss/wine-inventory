import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { type OwnerKind, type OwnerRow } from "@/lib/owner/data";

// Plan 093 (custom-crush data foundation), Unit 1: the write layer for `Owner`. Cores return a
// discriminated result ({ok:false, error}) rather than throwing ActionError — a thrown ActionError is
// redacted to an opaque string in prod, so the review/UI would show a useless message (see
// custom-unit-core.ts). Per-tenant name uniqueness is enforced by the DB @@unique; we pre-check for a
// friendly message and still catch the P2002 race. The tenant extension auto-injects tenantId on create.

export const MAX_OWNER_NAME = 120;

const OWNER_SELECT = { id: true, name: true, kind: true, isActive: true } as const;

const OWNER_KINDS: readonly OwnerKind[] = ["CUSTOM_CRUSH_CLIENT", "AP_PROPRIETOR"];

export type CreateOwnerInput = {
  name: string;
  kind: string; // validated to OwnerKind
};

export type CreateOwnerResult = { ok: true; owner: OwnerRow } | { ok: false; error: string };

function toRow(r: { id: string; name: string; kind: string; isActive: boolean }): OwnerRow {
  return { id: r.id, name: r.name, kind: r.kind as OwnerKind, isActive: r.isActive };
}

const isP2002 = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Create an Owner (a custom-crush client or AP proprietor) for the current tenant. Validates a non-empty
 * name (≤ MAX_OWNER_NAME) and a real kind. Facility wine is NOT an Owner (it is ownerId NULL), so there
 * is no ESTATE kind to create here. Reuses an injected tx (assistant/UI batch) or opens its own.
 */
export async function createOwnerCore(
  actor: LedgerActor,
  input: CreateOwnerInput,
  injectedTx?: Prisma.TransactionClient,
): Promise<CreateOwnerResult> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name for the owner." };
  if (name.length > MAX_OWNER_NAME) return { ok: false, error: `Owner name is too long (max ${MAX_OWNER_NAME} characters).` };

  const kind = input.kind as OwnerKind;
  if (!OWNER_KINDS.includes(kind)) {
    return { ok: false, error: "Choose whether the owner is a custom-crush client or an alternating proprietor." };
  }

  const body = async (tx: Prisma.TransactionClient): Promise<CreateOwnerResult> => {
    const clash = await tx.owner.findFirst({ where: { name }, select: { id: true } });
    if (clash) return { ok: false, error: `You already have an owner called "${name}".` };
    try {
      const row = await tx.owner.create({
        data: { name, kind },
        select: OWNER_SELECT,
      });
      await writeAudit(tx, {
        ...actor,
        action: "CREATE",
        entityType: "Owner",
        entityId: row.id,
        summary: `Created owner "${name}" (${kind === "AP_PROPRIETOR" ? "alternating proprietor" : "custom-crush client"})`,
      });
      return { ok: true, owner: toRow(row) };
    } catch (e) {
      if (isP2002(e)) return { ok: false, error: `You already have an owner called "${name}".` };
      throw e;
    }
  };

  return injectedTx ? body(injectedTx) : runInTenantTx(body);
}
