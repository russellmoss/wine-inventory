import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { getValidAccessToken, NeedsReauthError } from "@/lib/accounting/token";

// Phase 15 Unit 5 — the token-refresh sweep. Keeps idle connections alive: the QBO refresh token is a
// 100-day ROLLING credential, so a connection that never posts would eventually expire. We enumerate
// org ids as the least-privilege enumerator role (SEC-C3), then PER TENANT under app_rls (SET LOCAL,
// pooling-safe) proactively rotate any refresh token nearing expiry. runAsSystem is never used to
// read a tenant row. Idempotent + at-least-once safe (re-running just rotates again).

const REFRESH_WITHIN_DAYS = 14;
const DAY_MS = 86_400_000;

export type RefreshSweepSummary = {
  orgs: number;
  connected: number;
  rotated: number;
  needsReauth: number;
  errors: number;
};

export async function runAccountingRefreshSweep(): Promise<RefreshSweepSummary> {
  const orgIds = await listAllOrgIds();
  const summary: RefreshSweepSummary = { orgs: orgIds.length, connected: 0, rotated: 0, needsReauth: 0, errors: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.accountingConnection.findFirst({
          where: { provider: "QBO", status: "CONNECTED" },
          select: { id: true, refreshTokenExpiresAt: true },
        });
        if (!conn) return; // no connected QBO for this tenant — nothing to do
        summary.connected++;

        const near =
          !conn.refreshTokenExpiresAt || conn.refreshTokenExpiresAt.getTime() - Date.now() < REFRESH_WITHIN_DAYS * DAY_MS;
        if (!near) return;

        try {
          await getValidAccessToken(conn.id, { force: true }); // rotates -> resets the 100-day clock
          summary.rotated++;
        } catch (e) {
          if (e instanceof NeedsReauthError) summary.needsReauth++;
          else summary.errors++; // transient — next sweep retries; do not fail the whole run
        }
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return summary;
}
