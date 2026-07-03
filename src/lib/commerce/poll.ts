import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { Commerce7Adapter, commerce7CallContext } from "@/lib/commerce/commerce7";
import { syncOrder, type IngestResult } from "@/lib/commerce/ingest";
import type { CommerceAdapter, PageCursor } from "@/lib/commerce/adapter";

// Phase 16 Unit 5 — the poll cron: the SINGLE ingest path + the missed-webhook backstop. Per connected
// tenant it (1) drains dirty-marked orders (the webhook hints), (2) re-emits any WITHHELD orders (after a
// mapping fix), and (3) sweeps the (updatedAt, id) cursor with an OVERLAP window so a same-timestamp
// order on a page boundary is never skipped (re-ingesting an already-seen order diffs to null → no-op).
// Bounded per tenant per run (drain-over-ticks). Enumerates org ids as the least-privilege role;
// per-tenant work runs under app_rls (runAsTenant).

export type Commerce7PollDeps = { adapterFactory?: () => CommerceAdapter; orgIds?: string[] };

export type Commerce7PollSummary = {
  orgs: number;
  connected: number;
  processed: number;
  emitted: number;
  withheld: number;
  noop: number;
  errors: number;
};

const DIRTY_BATCH = Number(process.env.COMMERCE7_DIRTY_BATCH) || 100;
const MAX_PAGES = Number(process.env.COMMERCE7_POLL_MAX_PAGES) || 20; // bounded backstop per run
const OVERLAP_MS = 5 * 60 * 1000; // re-scan a 5-min window so page-boundary orders aren't skipped
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // first sweep (no cursor) looks back a day, not forever

function tally(summary: Commerce7PollSummary, r: IngestResult): void {
  summary.processed++;
  if (r.outcome === "emitted") summary.emitted++;
  else if (r.outcome === "withheld") summary.withheld++;
  else summary.noop++;
}

export async function runCommerce7PollSweep(deps?: Commerce7PollDeps): Promise<Commerce7PollSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: Commerce7PollSummary = { orgs: orgIds.length, connected: 0, processed: 0, emitted: 0, withheld: 0, noop: 0, errors: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.commerce7Connection.findFirst({
          where: { provider: "COMMERCE7", status: "CONNECTED" },
          select: { externalTenantId: true, pollCursorUpdatedAt: true },
        });
        if (!conn || !conn.externalTenantId) return;
        summary.connected++;

        const adapter = deps?.adapterFactory ? deps.adapterFactory() : new Commerce7Adapter();
        const ingestDeps = deps?.adapterFactory ? { adapterFactory: deps.adapterFactory } : undefined;
        const ctx = commerce7CallContext(conn.externalTenantId);

        // 1. Drain dirty markers (webhook hints).
        const dirty = await prisma.commerce7Order.findMany({ where: { dirty: true }, select: { commerce7OrderId: true }, take: DIRTY_BATCH });
        for (const d of dirty) {
          try { tally(summary, await syncOrder(d.commerce7OrderId, ingestDeps)); } catch { summary.errors++; }
        }

        // 2. Re-emit WITHHELD orders (a mapping may now exist).
        const withheld = await prisma.commerce7Order.findMany({ where: { withheldReason: { not: null } }, select: { commerce7OrderId: true }, take: DIRTY_BATCH });
        for (const w of withheld) {
          try { tally(summary, await syncOrder(w.commerce7OrderId, ingestDeps)); } catch { summary.errors++; }
        }

        // 3. Cursor sweep with overlap (the missed-webhook backstop).
        const floorMs = conn.pollCursorUpdatedAt ? conn.pollCursorUpdatedAt.getTime() - OVERLAP_MS : Date.now() - DEFAULT_LOOKBACK_MS;
        const floorIso = new Date(floorMs).toISOString();
        let cursor: PageCursor = { updatedAtGte: floorIso, page: 1 };
        let maxUpdatedAt = conn.pollCursorUpdatedAt ? conn.pollCursorUpdatedAt.toISOString() : floorIso;
        let drained = false;
        for (let page = 0; page < MAX_PAGES; page++) {
          const { orders, nextCursor } = await adapter.listOrdersSince(ctx, cursor);
          for (const o of orders) {
            if (o.updatedAt > maxUpdatedAt) maxUpdatedAt = o.updatedAt;
            try { tally(summary, await syncOrder(o.orderId, ingestDeps)); } catch { summary.errors++; }
          }
          if (!nextCursor) { drained = true; break; }
          cursor = nextCursor;
        }

        // Advance the watermark ONLY after a fully-drained page run (else we'd skip the un-fetched tail).
        await runInTenantTx((tx) =>
          tx.commerce7Connection.updateMany({
            where: { provider: "COMMERCE7", status: "CONNECTED" },
            data: { lastPolledAt: new Date(), ...(drained ? { pollCursorUpdatedAt: new Date(maxUpdatedAt) } : {}) },
          }),
        );
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return summary;
}
