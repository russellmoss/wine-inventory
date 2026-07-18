import "server-only";
import { FeedbackAutomationStatus, FeedbackClarificationStatus } from "@prisma/client";
import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { dispatchApprovedRun } from "@/lib/feedback/automation";

// Plan 079, Unit 13 (council C-6 / C-5): the watchdog. repository_dispatch is fire-and-forget, so a
// lost dispatch would leave a run stuck forever; and a reporter who never replies would leave a
// clarification OPEN forever. One cron reconciles both. Mirrors runVendorSyncSweep / the Commerce7
// poll cron. Runs cross-tenant under the owner; terminal transitions run tenant-scoped.

export const STALE_DISPATCH_MINUTES = 15;
export const CLARIFICATION_TTL_DAYS = 7;
/** Runaway backstop: never re-dispatch a source more than this many total attempts. */
export const MAX_LIFETIME_DISPATCHES = 6;

export type SweepSummary = {
  redispatched: number;
  deadLettered: number;
  clarificationsExpired: number;
};

type Src = { sourceType: "FEEDBACK_TICKET" | "ASSISTANT_FEEDBACK"; sourceId: string };

/** Move a run + its source to a terminal status (tenant-scoped). */
async function terminate(tenantId: string, src: Src, runId: string | null, status: FeedbackAutomationStatus, reason: string) {
  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      if (runId) {
        await tx.automationRun.updateMany({
          where: { id: runId },
          data: { status, completedAt: new Date(), error: reason.slice(0, 1000) },
        });
      }
      const data = { automationStatus: status };
      if (src.sourceType === "FEEDBACK_TICKET") await tx.feedbackTicket.update({ where: { id: src.sourceId }, data });
      else await tx.assistantFeedback.update({ where: { id: src.sourceId }, data });
    }),
  );
}

export async function runFeedbackAutomationSweep(opts?: {
  now?: Date;
  staleDispatchMinutes?: number;
  clarificationTtlDays?: number;
  /** Optionally scope the sweep to one tenant (operational + testing). Omit for all tenants. */
  tenantId?: string;
}): Promise<SweepSummary> {
  const now = opts?.now ?? new Date();
  const staleCutoff = new Date(now.getTime() - (opts?.staleDispatchMinutes ?? STALE_DISPATCH_MINUTES) * 60_000);
  const ttlCutoff = new Date(now.getTime() - (opts?.clarificationTtlDays ?? CLARIFICATION_TTL_DAYS) * 86_400_000);
  const tenantFilter = opts?.tenantId ? { tenantId: opts.tenantId } : {};

  const summary: SweepSummary = { redispatched: 0, deadLettered: 0, clarificationsExpired: 0 };

  // ── Job 1: lost / stuck dispatches ────────────────────────────────────────
  // Enumerate (owner, cross-tenant), then act per-row tenant-scoped.
  const stuck = await runAsSystem((db) =>
    db.automationRun.findMany({
      where: {
        ...tenantFilter,
        status: { in: [FeedbackAutomationStatus.QUEUED, FeedbackAutomationStatus.RUNNING] },
        updatedAt: { lt: staleCutoff },
      },
      select: { id: true, tenantId: true, status: true, sourceType: true, sourceId: true, attempt: true, claimedAt: true },
    }),
  );

  for (const run of stuck) {
    const src: Src = { sourceType: run.sourceType, sourceId: run.sourceId };
    if (run.status === FeedbackAutomationStatus.RUNNING) {
      // CI claimed the run but never wrote back → it died mid-run. Dead-letter to a human.
      await terminate(run.tenantId, src, run.id, FeedbackAutomationStatus.FAILED, "watchdog: run stalled in RUNNING (CI never completed)");
      summary.deadLettered++;
      continue;
    }
    // QUEUED and never claimed → the dispatch was lost. Re-dispatch once, unless we've hit the ceiling.
    if (run.attempt >= MAX_LIFETIME_DISPATCHES) {
      await terminate(run.tenantId, src, run.id, FeedbackAutomationStatus.FAILED, "watchdog: dispatch ceiling reached");
      summary.deadLettered++;
      continue;
    }
    // dispatchApprovedRun owns its own outcome: true = dispatched; false = either degraded back to
    // QUEUED (no token configured → the next sweep retries) or already marked FAILED on a transport
    // error. Either way the sweep must NOT additionally terminate it.
    if (await dispatchApprovedRun(run.id, run.tenantId)) summary.redispatched++;
  }

  // ── Job 2: unanswered clarifications past TTL ─────────────────────────────
  const staleOpen = await runAsSystem((db) =>
    db.feedbackClarification.findMany({
      where: { ...tenantFilter, status: FeedbackClarificationStatus.OPEN, askedAt: { lt: ttlCutoff } },
      select: { id: true, tenantId: true, sourceType: true, sourceId: true, automationRunId: true },
    }),
  );

  for (const clar of staleOpen) {
    const src: Src = { sourceType: clar.sourceType, sourceId: clar.sourceId };
    await runAsTenant(clar.tenantId, () =>
      runInTenantTx((tx) =>
        tx.feedbackClarification.updateMany({
          where: { id: clar.id, status: FeedbackClarificationStatus.OPEN },
          data: { status: FeedbackClarificationStatus.CANCELLED },
        }),
      ),
    );
    // Move the source out of AWAITING_CLARIFICATION → human triage.
    await terminate(clar.tenantId, src, clar.automationRunId, FeedbackAutomationStatus.SKIPPED, "watchdog: reporter did not reply within TTL");
    summary.clarificationsExpired++;
  }

  return summary;
}
