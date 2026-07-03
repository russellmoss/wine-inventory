import "server-only";
import type { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";

// Phase 16 Unit 5 — the DB side of the DTC revenue export seam, a TRANSACTIONAL OUTBOX like
// cost/export-emit. Called INSIDE the same SERIALIZABLE ingest tx that writes the immutable
// SalesExportEvent + depletes inventory, so a crash can never drop a posting. Creates a PENDING
// AccountingDelivery against the tenant's CONNECTED QuickBooks connection (revenue posts to QBO). No-op
// when QBO isn't connected — the SalesExportEvent is still the durable record, and Unit-7's re-emit
// backfills the delivery after connecting. Idempotent: `update: {}` never clobbers an IN_FLIGHT/POSTED row.

/** Create (idempotently) the PENDING revenue delivery for one sales export delta, inside the caller's tx. */
export async function createDeliveryForSale(tx: Prisma.TransactionClient, salesExportEventId: string): Promise<void> {
  const conn = await tx.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
  if (!conn) return; // no QBO yet — the delta is durable; re-emit backfills the delivery later (U7)
  const tenantId = requireTenantId();
  await tx.accountingDelivery.upsert({
    where: { tenantId_salesExportEventId: { tenantId, salesExportEventId } },
    create: { salesExportEventId, connectionId: conn.id, objectType: "JournalEntry", status: "PENDING" },
    update: {}, // idempotent — never clobber a delivery already IN_FLIGHT/POSTED
  });
}
