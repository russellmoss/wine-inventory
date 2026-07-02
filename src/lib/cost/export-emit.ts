import type { CostComponent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildExportLines, type AccountMap, accountKey, type ExportSource } from "@/lib/cost/export";
import type { Completeness } from "@/lib/cost/rollup";

// Phase 8b (Unit 14, D18) — the DB side of the accounting export seam. Reads the per-tenant account map,
// expands a frozen COGS snapshot (or variance) into per-component export lines via the pure builder, and
// writes immutable CostExportEvent rows IDEMPOTENTLY (skip if the postingKey already exists). Incomplete
// or unmapped sources are WITHHELD, never partially posted (D14). No QBO/Xero calls — Phase 15 posts the
// rows. Script-safe (no "server-only") so verify:cost drives it.

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
 * Emit the accounting export lines for one COGS snapshot. Idempotent: a line whose postingKey already
 * exists is skipped, so a re-run posts nothing new. Returns how many lines were written (0 if withheld).
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
  if (!batch.postable) return { emitted: 0, postable: false, reason: batch.reason };

  let emitted = 0;
  for (const line of batch.lines) {
    const exists = await db.costExportEvent.findFirst({ where: { postingKey: line.postingKey }, select: { id: true } });
    if (exists) continue;
    await db.costExportEvent.create({
      data: {
        postingKey: line.postingKey,
        sourceType: "SNAPSHOT",
        sourceSnapshotId: snap.id,
        runId: snap.runId,
        skuId: snap.skuId,
        taxClass: snap.taxClass,
        component: line.component,
        amount: line.amount,
        debitAccount: line.debitAccount as string,
        creditAccount: line.creditAccount as string,
        currency: line.currency,
        basisCompleteness: snap.basisCompleteness,
        policyVersion: snap.policyVersion,
      },
    });
    emitted++;
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
