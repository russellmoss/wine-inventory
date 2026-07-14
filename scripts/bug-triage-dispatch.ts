/**
 * Approve + dispatch ONE feedback AutomationRun — the exact state transition the
 * /developer "Approve" button performs:
 *   AWAITING_APPROVAL → QUEUED → RUNNING → repository_dispatch to the GitHub
 *   Actions fix agent (feedback_bug_fix | assistant_feedback). PLAN routing uses
 *   `triage:plan`, so an awaiting PLAN can never be mistaken for a fix here.
 *
 * Used by the /bug-triage skill to kick off a fix for a NEW bug it has triaged as
 * safe-to-attempt, without a human clicking Approve. It does NOT merge anything —
 * the agent opens a PR, which /bug-triage then triages under the tight auto-merge
 * gate. Idempotent-ish: a run that is not AWAITING_APPROVAL is refused (exit 1).
 *
 * Run (from a checkout that has .env — the main repo, not a worktree):
 *   npm run triage:dispatch -- --tenant=<tenantId> --run=<automationRunId> [--approver=<userId>]
 *
 * Requires GITHUB_REPOSITORY + GITHUB_DISPATCH_TOKEN in .env. If unset, the run is
 * left QUEUED with an error (same as the button) and this exits non-zero.
 */
import { FeedbackAutomationKind } from "@prisma/client";
import { approveAutomationRun, dispatchApprovedRun } from "../src/lib/feedback/automation";
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/**
 * approvedByUserId is informational (nullable, no FK), but we record a real
 * developer where possible so the audit trail matches a human approval.
 */
async function resolveApprover(tenantId: string): Promise<string | null> {
  const explicit = arg("approver") ?? process.env.TRIAGE_APPROVER_USER_ID;
  if (explicit) return explicit;
  return runAsSystem(async (db) => {
    const dev = await db.user.findFirst({
      where: { role: "developer" },
      select: { id: true },
    });
    if (dev?.id) return dev.id;
    const member = await db.member.findFirst({
      where: { organizationId: tenantId },
      select: { userId: true },
    });
    return member?.userId ?? null;
  });
}

async function main() {
  const tenantId = arg("tenant");
  const runId = arg("run");
  if (!tenantId || !runId) {
    console.error("Usage: --tenant=<tenantId> --run=<automationRunId> [--approver=<userId>]");
    process.exit(2);
  }

  const approverUserId = await resolveApprover(tenantId);
  if (!approverUserId) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "Could not resolve an approver user id — pass --approver=<userId>.",
      }),
    );
    process.exit(1);
  }

  const run = await approveAutomationRun({
    tenantId,
    runId,
    approverUserId,
    expectedKind: FeedbackAutomationKind.AGENTIC_FIX,
  });
  if (!run) {
    console.log(
      JSON.stringify({
        ok: false,
        tenantId,
        runId,
        error: "Run is not an AWAITING_APPROVAL AGENTIC_FIX (already handled, wrong kind, id, or tenant).",
      }),
    );
    process.exit(1);
  }

  const dispatched = await dispatchApprovedRun(runId, tenantId);
  console.log(
    JSON.stringify(
      {
        ok: dispatched,
        tenantId,
        runId,
        kind: run.kind,
        sourceType: run.sourceType,
        sourceId: run.sourceId,
        approverUserId,
        dispatched,
        note: dispatched
          ? "Dispatched to the GitHub Actions fix agent (status → RUNNING)."
          : "Approved (QUEUED) but dispatch did not fire — check GITHUB_REPOSITORY / GITHUB_DISPATCH_TOKEN. It can still be dispatched from /developer.",
      },
      null,
      2,
    ),
  );
  if (!dispatched) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
    process.exit(process.exitCode ?? 0);
  });
