/**
 * Ensure and dispatch the existing PLAN automation path for one triaged
 * PRODUCT_GAP. This is intentionally separate from `triage:dispatch`, which is
 * AGENTIC_FIX-only for the bug-triage goalie.
 *
 * Run:
 *   npm run triage:plan -- --tenant=<tenantId> \
 *     --source=<FEEDBACK_TICKET|ASSISTANT_FEEDBACK> --id=<sourceId> [--approver=<userId>]
 */
import {
  FeedbackAutomationKind,
  FeedbackAutomationSource,
  FeedbackAutomationStatus,
} from "@prisma/client";
import {
  approveAutomationRun,
  dispatchApprovedRun,
  ensurePlanAutomationRun,
  planRunNeedsReconciliation,
} from "../src/lib/feedback/automation";
import { disconnectSystem, runAsSystem } from "../src/lib/tenant/system";

function arg(name: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function resolveApprover(tenantId: string): Promise<string | null> {
  const explicit = arg("approver") ?? process.env.TRIAGE_APPROVER_USER_ID;
  if (explicit) return explicit;
  return runAsSystem(async (db) => {
    const developer = await db.user.findFirst({
      where: { role: "developer" },
      select: { id: true },
    });
    if (developer?.id) return developer.id;
    const member = await db.member.findFirst({
      where: { organizationId: tenantId },
      select: { userId: true },
    });
    return member?.userId ?? null;
  });
}

async function dispatchPlanOrObserve(input: {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  sourceId: string;
  runId: string;
}): Promise<{
  ok: boolean;
  dispatched: boolean;
  status: FeedbackAutomationStatus | null;
}> {
  const dispatched = await dispatchApprovedRun(input.runId, input.tenantId);
  if (dispatched) {
    return { ok: true, dispatched: true, status: FeedbackAutomationStatus.RUNNING };
  }

  const refreshed = await ensurePlanAutomationRun({
    tenantId: input.tenantId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  if (!refreshed.ok || refreshed.run.id !== input.runId || planRunNeedsReconciliation(refreshed.run)) {
    return {
      ok: false,
      dispatched: false,
      status: refreshed.ok ? refreshed.run.status : null,
    };
  }
  const observedInFlightOrComplete =
    refreshed.run.status === FeedbackAutomationStatus.RUNNING ||
    refreshed.run.status === FeedbackAutomationStatus.PLANNED ||
    refreshed.run.status === FeedbackAutomationStatus.PR_OPENED;
  return {
    ok: observedInFlightOrComplete,
    dispatched: false,
    status: refreshed.run.status,
  };
}

async function main() {
  const tenantId = arg("tenant");
  const source = arg("source");
  const sourceId = arg("id");
  if (
    !tenantId ||
    !sourceId ||
    (source !== FeedbackAutomationSource.FEEDBACK_TICKET &&
      source !== FeedbackAutomationSource.ASSISTANT_FEEDBACK)
  ) {
    console.error(
      "Usage: --tenant=<tenantId> --source=<FEEDBACK_TICKET|ASSISTANT_FEEDBACK> " +
        "--id=<sourceId> [--approver=<userId>]",
    );
    process.exit(2);
  }

  const approverUserId = await resolveApprover(tenantId);
  if (!approverUserId) {
    console.log(
      JSON.stringify({ ok: false, error: "Could not resolve an approver user id; pass --approver=<userId>." }),
    );
    process.exit(1);
  }

  const ensured = await ensurePlanAutomationRun({
    tenantId,
    sourceType: source,
    sourceId,
  });
  if (!ensured.ok) {
    console.log(JSON.stringify({ tenantId, sourceType: source, sourceId, ...ensured }, null, 2));
    process.exit(1);
  }

  if (ensured.run.status === FeedbackAutomationStatus.QUEUED) {
    const outcome = await dispatchPlanOrObserve({
      tenantId,
      sourceType: source,
      sourceId,
      runId: ensured.run.id,
    });
    console.log(
      JSON.stringify(
        {
          ok: outcome.ok,
          tenantId,
          sourceType: source,
          sourceId,
          runId: ensured.run.id,
          kind: ensured.run.kind,
          skippedRunIds: ensured.skippedRunIds,
          status: outcome.status,
          dispatched: outcome.dispatched,
          note: outcome.dispatched
            ? "Retried the queued PLAN through the existing feedback_plan GitHub Actions workflow."
            : outcome.ok
              ? "Another caller already dispatched the same PLAN; no duplicate dispatch was attempted."
              : "PLAN remains unconfirmed because GitHub dispatch did not fire; inspect repository dispatch configuration.",
        },
        null,
        2,
      ),
    );
    if (!outcome.ok) process.exit(1);
    return;
  }

  if (planRunNeedsReconciliation(ensured.run)) {
    console.log(
      JSON.stringify({
        ok: false,
        tenantId,
        sourceType: source,
        sourceId,
        runId: ensured.run.id,
        kind: ensured.run.kind,
        status: ensured.run.status,
        error: "PLAN has remained RUNNING without a completion artifact; reconcile it in GitHub Actions before rerouting.",
      }),
    );
    process.exit(1);
  }

  if (ensured.run.status !== FeedbackAutomationStatus.AWAITING_APPROVAL) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId,
          sourceType: source,
          sourceId,
          runId: ensured.run.id,
          kind: ensured.run.kind,
          status: ensured.run.status,
          skippedRunIds: ensured.skippedRunIds,
          dispatched: false,
          note: "PLAN already exists and is not awaiting approval; no duplicate dispatch was attempted.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const approved = await approveAutomationRun({
    tenantId,
    runId: ensured.run.id,
    approverUserId,
    expectedKind: FeedbackAutomationKind.PLAN,
  });
  if (!approved) {
    const outcome = await dispatchPlanOrObserve({
      tenantId,
      sourceType: source,
      sourceId,
      runId: ensured.run.id,
    });
    if (outcome.ok) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            tenantId,
            sourceType: source,
            sourceId,
            runId: ensured.run.id,
            kind: ensured.run.kind,
            status: outcome.status,
            skippedRunIds: ensured.skippedRunIds,
            dispatched: outcome.dispatched,
            note: outcome.dispatched
              ? "Another caller approved the PLAN; this caller safely claimed and dispatched it."
              : "Another caller already advanced the same PLAN; no duplicate dispatch was attempted.",
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify({
        ok: false,
        tenantId,
        sourceType: source,
        sourceId,
        runId: ensured.run.id,
        error: "PLAN could not be claimed or confirmed in flight; reload triage state.",
      }),
    );
    process.exit(1);
  }

  const outcome = await dispatchPlanOrObserve({
    tenantId,
    sourceType: source,
    sourceId,
    runId: approved.id,
  });
  console.log(
    JSON.stringify(
      {
        ok: outcome.ok,
        tenantId,
        sourceType: source,
        sourceId,
        runId: approved.id,
        kind: approved.kind,
        skippedRunIds: ensured.skippedRunIds,
        approverUserId,
        status: outcome.status,
        dispatched: outcome.dispatched,
        note: outcome.dispatched
          ? "Dispatched to the existing feedback_plan GitHub Actions workflow."
          : outcome.ok
            ? "Another caller already dispatched the same PLAN; no duplicate dispatch was attempted."
            : "PLAN approved but GitHub dispatch could not be confirmed; inspect repository dispatch configuration.",
      },
      null,
      2,
    ),
  );
  if (!outcome.ok) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
    process.exit(process.exitCode ?? 0);
  });
