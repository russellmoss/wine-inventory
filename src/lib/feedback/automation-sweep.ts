import "server-only";
import { FeedbackAutomationStatus, FeedbackClarificationStatus, FeedbackItemStatus } from "@prisma/client";
import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { dispatchApprovedRun } from "@/lib/feedback/automation";

// Plan 079, Unit 13 (council C-5 / C-6): the watchdog. repository_dispatch is fire-and-forget, so a
// lost dispatch would leave a run stuck; a reporter who never replies would leave a clarification OPEN
// forever; and a reply whose re-dispatch failed mid-flight would strand the source at
// AWAITING_CLARIFICATION invisibly. One cron reconciles all three. Mirrors runVendorSyncSweep. Runs
// cross-tenant under the owner; terminal transitions run tenant-scoped and are guarded so a human who
// already resolved/dismissed the item is never overwritten or re-dispatched. Every row is isolated in
// its own try/catch so one bad row can't abort the whole sweep.

export const STALE_DISPATCH_MINUTES = 15; // QUEUED but never claimed → dispatch was lost
export const STALE_RUNNING_MINUTES = 60; // RUNNING but never wrote back → CI died (fixes can run long)
export const CLARIFICATION_TTL_DAYS = 7;
/** Runaway backstop: never re-dispatch a source more than this many total attempts. */
export const MAX_LIFETIME_DISPATCHES = 6;

const CLOSED_TICKET_STATUSES: FeedbackItemStatus[] = [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED];
const CLOSED_FEEDBACK_STATUSES: string[] = ["RESOLVED", "DISMISSED"];

export type SweepSummary = {
  redispatched: number;
  deadLettered: number;
  clarificationsExpired: number;
  recovered: number; // stranded answered-but-not-redispatched sources escalated to a human
};

type Src = { sourceType: "FEEDBACK_TICKET" | "ASSISTANT_FEEDBACK"; sourceId: string };

/**
 * Move a run + its source to a terminal status (tenant-scoped). The SOURCE update is guarded to open
 * items only (updateMany WHERE status not closed) so a human who already resolved/dismissed the item
 * is never clobbered. The run update is unconditional (retiring a run is always safe).
 */
async function terminate(tenantId: string, src: Src, runId: string | null, status: FeedbackAutomationStatus, reason: string) {
  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      if (runId) {
        await tx.automationRun.updateMany({
          where: { id: runId },
          data: { status, completedAt: new Date(), error: reason.slice(0, 1000) },
        });
      }
      if (src.sourceType === "FEEDBACK_TICKET") {
        await tx.feedbackTicket.updateMany({
          where: { id: src.sourceId, status: { notIn: CLOSED_TICKET_STATUSES } },
          data: { automationStatus: status },
        });
      } else {
        await tx.assistantFeedback.updateMany({
          where: { id: src.sourceId, status: { notIn: CLOSED_FEEDBACK_STATUSES } },
          data: { automationStatus: status },
        });
      }
    }),
  );
}

/** Is the source item still open (not resolved/dismissed by a human)? Read as owner (cross-tenant). */
async function isSourceOpen(src: Src): Promise<boolean> {
  return runAsSystem(async (db) => {
    if (src.sourceType === "FEEDBACK_TICKET") {
      const t = await db.feedbackTicket.findUnique({ where: { id: src.sourceId }, select: { status: true } });
      return !!t && !CLOSED_TICKET_STATUSES.includes(t.status);
    }
    const f = await db.assistantFeedback.findUnique({ where: { id: src.sourceId }, select: { status: true } });
    return !!f && !CLOSED_FEEDBACK_STATUSES.includes(f.status);
  });
}

export async function runFeedbackAutomationSweep(opts?: {
  now?: Date;
  staleDispatchMinutes?: number;
  staleRunningMinutes?: number;
  clarificationTtlDays?: number;
  /** Optionally scope the sweep to one tenant (operational + testing). Omit for all tenants. */
  tenantId?: string;
}): Promise<SweepSummary> {
  const now = opts?.now ?? new Date();
  const queuedCutoff = new Date(now.getTime() - (opts?.staleDispatchMinutes ?? STALE_DISPATCH_MINUTES) * 60_000);
  const runningCutoff = new Date(now.getTime() - (opts?.staleRunningMinutes ?? STALE_RUNNING_MINUTES) * 60_000);
  const ttlCutoff = new Date(now.getTime() - (opts?.clarificationTtlDays ?? CLARIFICATION_TTL_DAYS) * 86_400_000);
  const tenantFilter: { tenantId?: string } = opts?.tenantId ? { tenantId: opts.tenantId } : {};

  const summary: SweepSummary = { redispatched: 0, deadLettered: 0, clarificationsExpired: 0, recovered: 0 };

  // ── Job 1a: QUEUED runs never claimed → the dispatch was lost. Re-dispatch (unless the source was
  //    closed by a human, or we've hit the ceiling). ─────────────────────────────────────────────
  const stuckQueued = await runAsSystem((db) =>
    db.automationRun.findMany({
      where: { ...tenantFilter, status: FeedbackAutomationStatus.QUEUED, updatedAt: { lt: queuedCutoff } },
      select: { id: true, tenantId: true, sourceType: true, sourceId: true, attempt: true },
    }),
  );
  for (const run of stuckQueued) {
    const src: Src = { sourceType: run.sourceType, sourceId: run.sourceId };
    try {
      if (!(await isSourceOpen(src))) {
        // A human resolved/dismissed it while the run sat QUEUED → retire the moot run, leave the source.
        await terminate(run.tenantId, src, run.id, FeedbackAutomationStatus.SKIPPED, "watchdog: source already resolved/dismissed");
        continue;
      }
      if (run.attempt >= MAX_LIFETIME_DISPATCHES) {
        await terminate(run.tenantId, src, run.id, FeedbackAutomationStatus.FAILED, "watchdog: dispatch ceiling reached");
        summary.deadLettered++;
        continue;
      }
      // dispatchApprovedRun owns its own outcome: true = dispatched; false = degraded back to QUEUED (no
      // token → next sweep retries) or already FAILED on a transport error. Either way, don't terminate.
      if (await dispatchApprovedRun(run.id, run.tenantId)) summary.redispatched++;
    } catch (e) {
      console.error("sweep: stuck-QUEUED row failed", run.id, e);
    }
  }

  // ── Job 1b: RUNNING runs that never wrote back past the (longer) running cutoff → CI died. ───────
  const stuckRunning = await runAsSystem((db) =>
    db.automationRun.findMany({
      where: { ...tenantFilter, status: FeedbackAutomationStatus.RUNNING, updatedAt: { lt: runningCutoff } },
      select: { id: true, tenantId: true, sourceType: true, sourceId: true },
    }),
  );
  for (const run of stuckRunning) {
    const src: Src = { sourceType: run.sourceType, sourceId: run.sourceId };
    try {
      await terminate(run.tenantId, src, run.id, FeedbackAutomationStatus.FAILED, "watchdog: run stalled in RUNNING (CI never completed)");
      summary.deadLettered++;
    } catch (e) {
      console.error("sweep: stuck-RUNNING row failed", run.id, e);
    }
  }

  // ── Job 2: unanswered clarifications past TTL → cancel + move the source to human triage. ────────
  const staleOpen = await runAsSystem((db) =>
    db.feedbackClarification.findMany({
      where: { ...tenantFilter, status: FeedbackClarificationStatus.OPEN, askedAt: { lt: ttlCutoff } },
      select: { id: true, tenantId: true, sourceType: true, sourceId: true, automationRunId: true },
    }),
  );
  for (const clar of staleOpen) {
    const src: Src = { sourceType: clar.sourceType, sourceId: clar.sourceId };
    try {
      await runAsTenant(clar.tenantId, () =>
        runInTenantTx((tx) =>
          tx.feedbackClarification.updateMany({
            where: { id: clar.id, status: FeedbackClarificationStatus.OPEN },
            data: { status: FeedbackClarificationStatus.CANCELLED },
          }),
        ),
      );
      await terminate(clar.tenantId, src, clar.automationRunId, FeedbackAutomationStatus.SKIPPED, "watchdog: reporter did not reply within TTL");
      summary.clarificationsExpired++;
    } catch (e) {
      console.error("sweep: TTL clarification row failed", clar.id, e);
    }
  }

  // ── Job 3: recover sources STRANDED at AWAITING_CLARIFICATION whose clarification is no longer OPEN
  //    (the reply landed but the re-dispatch failed between the ANSWERED flip and the new run). Jobs
  //    1 & 2 can't see these. Escalate to a human — the answer is on the clarification for them to
  //    read — so it's visible + unstuck instead of silently stuck forever. ─────────────────────────
  const strandedTickets = await runAsSystem((db) =>
    db.feedbackTicket.findMany({
      where: { ...tenantFilter, automationStatus: FeedbackAutomationStatus.AWAITING_CLARIFICATION, updatedAt: { lt: queuedCutoff }, status: { notIn: CLOSED_TICKET_STATUSES } },
      select: { id: true, tenantId: true },
    }),
  );
  const strandedFeedback = await runAsSystem((db) =>
    db.assistantFeedback.findMany({
      // AssistantFeedback has no updatedAt — createdAt is a fine "old enough" proxy for a strand.
      where: { ...tenantFilter, automationStatus: FeedbackAutomationStatus.AWAITING_CLARIFICATION, createdAt: { lt: queuedCutoff }, status: { notIn: CLOSED_FEEDBACK_STATUSES } },
      select: { id: true, tenantId: true },
    }),
  );
  const strands: { tenantId: string; src: Src }[] = [
    ...strandedTickets.map((t) => ({ tenantId: t.tenantId, src: { sourceType: "FEEDBACK_TICKET" as const, sourceId: t.id } })),
    ...strandedFeedback.map((f) => ({ tenantId: f.tenantId, src: { sourceType: "ASSISTANT_FEEDBACK" as const, sourceId: f.id } })),
  ];
  for (const s of strands) {
    try {
      const clar = await runAsSystem((db) =>
        db.feedbackClarification.findFirst({
          where: { sourceType: s.src.sourceType, sourceId: s.src.sourceId },
          orderBy: { askedAt: "desc" },
          select: { status: true, automationRunId: true },
        }),
      );
      if (!clar || clar.status === FeedbackClarificationStatus.OPEN) continue; // still waiting → Job 2's job
      await terminate(s.tenantId, s.src, clar.automationRunId, FeedbackAutomationStatus.SKIPPED, "watchdog: reply received but re-dispatch did not complete — needs a human");
      summary.recovered++;
    } catch (e) {
      console.error("sweep: strand recovery failed", s.src.sourceId, e);
    }
  }

  return summary;
}
