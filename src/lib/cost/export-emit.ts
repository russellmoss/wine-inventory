import type { CostComponent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import {
  buildExportLines,
  buildVarianceExportLines,
  type AccountMap,
  accountKey,
  type ExportSource,
} from "@/lib/cost/export";
import type { Completeness } from "@/lib/cost/rollup";

// Phase 8b (Unit 14, D18) + Phase 15 Unit 7 — the DB side of the accounting export seam, now a
// TRANSACTIONAL OUTBOX. Called INSIDE the same tx that freezes a COGS snapshot (bottling) or writes a
// post-bottling variance (correction), so a crash can never drop a posting (council C1). For each
// component line it writes an immutable CostExportEvent AND — when the tenant has a CONNECTED QBO
// connection — a matching AccountingDelivery: PENDING when the whole source is postable, WITHHELD (with
// a reason) when it isn't (D14: basis not KNOWN, or a component unmapped). The poster (Unit 8) only
// ever posts PENDING rows. Idempotent by postingKey. Script-safe (no "server-only").

type Db = Prisma.TransactionClient;
const asDb = (db?: Db): Db => db ?? (prisma as unknown as Db);

/** Load the tenant's (component, tax-class) → debit/credit account map. */
export async function getAccountMap(dbArg?: Db): Promise<AccountMap> {
  const db = asDb(dbArg);
  const rows = await db.accountMapping.findMany({
    select: { component: true, taxClass: true, debitAccount: true, creditAccount: true },
  });
  const map: AccountMap = new Map();
  for (const r of rows) map.set(accountKey(r.component, r.taxClass), { debit: r.debitAccount, credit: r.creditAccount });
  return map;
}

export type EmitResult = { emitted: number; postable: boolean; reason?: string };

/**
 * Create (idempotently) the AccountingDelivery for one export event. No-op when the tenant has no
 * CONNECTED QBO connection — the CostExportEvent is still the durable record, and a later re-emit
 * (after connecting) backfills the delivery via this same upsert. `update: {}` never clobbers a
 * delivery already IN_FLIGHT/POSTED.
 */
async function createDeliveryForExport(db: Db, exportEventId: string): Promise<void> {
  const conn = await db.accountingConnection.findFirst({
    where: { provider: "QBO", status: "CONNECTED" },
    select: { id: true },
  });
  if (!conn) return;
  const tenantId = requireTenantId();
  await db.accountingDelivery.upsert({
    where: { tenantId_costExportEventId: { tenantId, costExportEventId: exportEventId } },
    create: { costExportEventId: exportEventId, connectionId: conn.id, objectType: "JournalEntry", status: "PENDING" },
    update: {}, // idempotent — never clobber a delivery already IN_FLIGHT/POSTED
  });
}

/**
 * Emit the accounting export lines for one COGS snapshot + their deliveries. Idempotent: a line whose
 * postingKey already exists is not re-created (but its delivery is still upserted, so connecting after
 * a bottling and re-emitting backfills deliveries). Returns how many NEW event rows were written.
 */
export async function emitExportForSnapshot(snapshotId: string, dbArg?: Db): Promise<EmitResult> {
  const db = asDb(dbArg);
  const snap = await db.bottlingCostSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true, runId: true, skuId: true, taxClass: true, componentBreakdown: true, currency: true,
      basisCompleteness: true, policyVersion: true, postingKey: true, reversalOfSnapshotId: true,
    },
  });
  if (!snap || !snap.postingKey) return { emitted: 0, postable: false, reason: "snapshot missing or has no postingKey" };

  const map = await getAccountMap(db);
  const src: ExportSource = {
    postingKey: snap.postingKey,
    componentBreakdown: (snap.componentBreakdown as Partial<Record<CostComponent, number>>) ?? {},
    taxClass: snap.taxClass,
    currency: snap.currency,
    basisCompleteness: snap.basisCompleteness as Completeness,
    isReversal: !!snap.reversalOfSnapshotId,
  };
  const batch = buildExportLines(src, map);
  // WITHHELD (basis not KNOWN, or a component unmapped) → emit NOTHING. CostExportEvent is immutable
  // (D2), so persisting a null-account row would permanently strand the posting once the operator maps
  // it. Instead a source stays un-exported; the poster's re-emit retry (Unit 8) picks it up after the
  // mapping is fixed, and the dashboard (Unit 12) surfaces "waiting on a mapping". (Gemini: a new tax
  // class must not freeze the sync.)
  if (!batch.postable) return { emitted: 0, postable: false, reason: batch.reason };

  let emitted = 0;
  for (const line of batch.lines) {
    const exists = await db.costExportEvent.findFirst({ where: { postingKey: line.postingKey }, select: { id: true } });
    let eventId: string;
    if (exists) {
      eventId = exists.id;
    } else {
      const created = await db.costExportEvent.create({
        data: {
          postingKey: line.postingKey,
          sourceType: "SNAPSHOT",
          sourceSnapshotId: snap.id,
          runId: snap.runId,
          skuId: snap.skuId,
          taxClass: snap.taxClass,
          component: line.component,
          amount: line.amount,
          debitAccount: line.debitAccount,
          creditAccount: line.creditAccount,
          currency: line.currency,
          basisCompleteness: snap.basisCompleteness,
          policyVersion: snap.policyVersion,
        },
        select: { id: true },
      });
      eventId = created.id;
      emitted++;
    }
    await createDeliveryForExport(db, eventId);
  }
  return { emitted, postable: true };
}

/**
 * Emit the export lines for one post-bottling CostVarianceEvent (sold → COGS, unsold → inventory) +
 * their deliveries. Same durable/idempotent path as snapshots. postingKeys: `var:<id>:{sold|unsold}`.
 */
export async function emitExportForVariance(varianceEventId: string, dbArg?: Db): Promise<EmitResult> {
  const db = asDb(dbArg);
  const v = await db.costVarianceEvent.findUnique({
    where: { id: varianceEventId },
    select: { id: true, runId: true, skuId: true, soldDelta: true, unsoldDelta: true, currency: true, basisCompleteness: true, policyVersion: true },
  });
  if (!v) return { emitted: 0, postable: false, reason: "variance event not found" };

  const map = await getAccountMap(db);
  const batch = buildVarianceExportLines(
    {
      varianceEventId: v.id,
      soldDelta: Number(v.soldDelta),
      unsoldDelta: Number(v.unsoldDelta),
      currency: v.currency,
      basisCompleteness: v.basisCompleteness as Completeness,
    },
    map,
  );
  if (!batch.postable) return { emitted: 0, postable: false, reason: batch.reason }; // stays un-exported until mapped (see emitExportForSnapshot)

  let emitted = 0;
  for (const line of batch.lines) {
    const exists = await db.costExportEvent.findFirst({ where: { postingKey: line.postingKey }, select: { id: true } });
    let eventId: string;
    if (exists) {
      eventId = exists.id;
    } else {
      const created = await db.costExportEvent.create({
        data: {
          postingKey: line.postingKey,
          sourceType: "VARIANCE",
          sourceVarianceEventId: v.id,
          runId: v.runId,
          skuId: v.skuId,
          taxClass: null,
          component: "VARIANCE",
          amount: line.amount,
          debitAccount: line.debitAccount,
          creditAccount: line.creditAccount,
          currency: line.currency,
          basisCompleteness: v.basisCompleteness,
          policyVersion: v.policyVersion,
        },
        select: { id: true },
      });
      eventId = created.id;
      emitted++;
    }
    await createDeliveryForExport(db, eventId);
  }
  return { emitted, postable: true };
}

/** The per-SKU / per-run export view: the immutable export lines, newest first. */
export async function getExportEvents(
  filter: { skuId?: string; runId?: string } = {},
  dbArg?: Db,
) {
  const db = asDb(dbArg);
  return db.costExportEvent.findMany({
    where: { ...(filter.skuId ? { skuId: filter.skuId } : {}), ...(filter.runId ? { runId: filter.runId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
