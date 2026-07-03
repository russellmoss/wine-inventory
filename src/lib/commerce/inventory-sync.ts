import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { Commerce7Adapter, commerce7CallContext } from "@/lib/commerce/commerce7";
import type { CommerceAdapter } from "@/lib/commerce/adapter";

// Phase 16 Unit 6 — outbound inventory: mirror ERP finished-goods INCREASES to Commerce7, additively +
// idempotently. ERP is authoritative; C7 is a replica. We push ONLY positive stock movements (RECEIVE /
// positive ADJUST) — NEVER a SALE/negative move (C7 already decremented itself on its own sale) and
// NEVER an absolute reset (which would race an oversell). Idempotency is CLAIM-FIRST: advance the
// per-(variant, location) watermark in a tx BEFORE pushing, so a concurrent/rerun sees the advanced
// watermark and pushes nothing (one net effect). A push that fails after the claim under-counts C7 →
// the read-only drift detector surfaces it for human review (never a silent double-count).

export type Commerce7InventoryDeps = { adapterFactory?: () => CommerceAdapter; orgIds?: string[] };

export type InventorySyncSummary = { orgs: number; connected: number; variants: number; pushed: number; pushedUnits: number; failed: number };

const MOVE_BATCH = Number(process.env.COMMERCE7_MOVE_BATCH) || 500;

/** PURE: does this movement INCREASE on-hand in a way we mirror to C7? (RECEIVE / positive ADJUST only —
 *  transfers move stock between OUR locations and would double-count in C7; sales already decremented C7.) */
export function isIncreaseMovement(kind: string, deltaUnits: number): boolean {
  return (kind === "RECEIVE" || kind === "ADJUST") && deltaUnits > 0;
}

export async function runCommerce7InventorySync(deps?: Commerce7InventoryDeps): Promise<InventorySyncSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: InventorySyncSummary = { orgs: orgIds.length, connected: 0, variants: 0, pushed: 0, pushedUnits: 0, failed: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7", status: "CONNECTED" }, select: { externalTenantId: true } });
        if (!conn || !conn.externalTenantId) return;
        summary.connected++;
        const adapter = deps?.adapterFactory ? deps.adapterFactory() : new Commerce7Adapter();
        const ctx = commerce7CallContext(conn.externalTenantId);

        const maps = await prisma.commerce7SkuMap.findMany({
          where: { active: true, wineSkuId: { not: null }, locationId: { not: null } },
          select: { id: true, externalVariantId: true, externalInventoryLocationId: true, wineSkuId: true, locationId: true, lastPushedMovementAt: true, lastPushedMovementId: true },
        });

        for (const m of maps) {
          summary.variants++;
          const at = m.lastPushedMovementAt;
          const id = m.lastPushedMovementId;
          const cursorWhere: Prisma.StockMovementWhereInput = at
            ? { OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: id ?? "" } }] }
            : {};
          const movements = await prisma.stockMovement.findMany({
            where: { itemKind: "BOTTLED_WINE", wineSkuId: m.wineSkuId, locationId: m.locationId, kind: { in: ["RECEIVE", "ADJUST"] }, deltaUnits: { gt: 0 }, ...cursorWhere },
            select: { id: true, createdAt: true, deltaUnits: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: MOVE_BATCH,
          });
          if (movements.length === 0) continue;

          const delta = movements.reduce((s, mv) => s + mv.deltaUnits, 0);
          const last = movements[movements.length - 1];

          // CLAIM: advance the watermark iff it still matches what we read (optimistic). If 0 rows, a
          // concurrent run already claimed these movements — skip (one net effect).
          const claimed = await runInTenantTx((tx) =>
            tx.commerce7SkuMap.updateMany({
              where: { id: m.id, lastPushedMovementId: id, lastPushedMovementAt: at },
              data: { lastPushedMovementAt: last.createdAt, lastPushedMovementId: last.id },
            }),
          );
          if (claimed.count === 0) continue;

          try {
            if (delta > 0) await adapter.adjustInventory(ctx, m.externalVariantId, m.externalInventoryLocationId, delta);
            summary.pushed++;
            summary.pushedUnits += delta;
          } catch {
            // Push failed AFTER the claim → C7 under-counts by `delta`; the drift detector surfaces it.
            // We do NOT roll back the watermark (that would risk a double-push on retry).
            summary.failed++;
          }
        }
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return summary;
}
