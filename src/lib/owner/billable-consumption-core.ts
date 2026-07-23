import type { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";

// Plan 093 Unit 6 (council C2): a cross-owner blend is ALLOWED; the consumed minority owner's fraction is
// captured here for commercial reconciliation (the facility bills the client for topping wine, or a JV is
// reconciled) — NEVER blocking the physical cellar work. Emitted inside the blend's ledger tx.

export type BillableConsumptionInput = {
  operationId: number;
  sourceLotId: string;
  /** the minority owner whose wine was consumed (NULL = facility topping wine). */
  consumedOwnerId: string | null;
  /** the dominant/receiving owner of the result (NULL = facility). */
  receivingOwnerId: string | null;
  volumeL: number;
};

/**
 * Record a cross-owner consumption. NO-OP when the two owners are the same (incl. facility↔facility) — a
 * same-owner blend has nothing to bill — or the volume is dust. Keyed (op, sourceLot) so it is written
 * once per consumed lot per op (a SERIALIZABLE retry re-runs the whole tx with a fresh opId, so no clash).
 */
export async function emitBillableConsumption(tx: Prisma.TransactionClient, input: BillableConsumptionInput): Promise<void> {
  if ((input.consumedOwnerId ?? null) === (input.receivingOwnerId ?? null)) return;
  if (!(input.volumeL > 1e-9)) return;
  await tx.billableWineConsumed.create({
    data: {
      tenantId: requireTenantId(),
      operationId: input.operationId,
      sourceLotId: input.sourceLotId,
      consumedOwnerId: input.consumedOwnerId ?? null,
      receivingOwnerId: input.receivingOwnerId ?? null,
      volumeL: input.volumeL,
    },
  });
}

/** Void the billable rows for a blend that was reversed/corrected (append-only: status → VOID, not delete). */
export async function voidBillableConsumptionForOp(tx: Prisma.TransactionClient, operationId: number): Promise<void> {
  await tx.billableWineConsumed.updateMany({ where: { operationId, status: "PENDING" }, data: { status: "VOID" } });
}
