// Plan 079, Unit 8: the CI write-back for an in-agent clarification request. The fix agent, when it
// can't fix a report confidently, writes `.feedback-clarification.json` ({ questions, reason }) and the
// workflow runs this against the AutomationRun id. Resolves the run's tenant + source under the owner,
// then asks the reporter via requestClarificationCore (which parks the run at AWAITING_CLARIFICATION
// and DMs them). Run with react-server conditions (the core is server-only):
//   npx tsx --conditions=react-server scripts/feedback-clarification-request.ts <automationRunId>
import { readFileSync } from "node:fs";
import { runAsSystem } from "@/lib/tenant/system";
import { requestClarificationCore, type RequestClarificationResult } from "@/lib/feedback/clarification";
import { markAutomationRunFailed } from "@/lib/feedback/automation";
import type { FeedbackSource } from "@/lib/feedback/automation";

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error("usage: feedback-clarification-request.ts <automationRunId>");

  let questions: string[] = [];
  try {
    const raw = JSON.parse(readFileSync(".feedback-clarification.json", "utf8")) as { questions?: unknown };
    questions = Array.isArray(raw.questions) ? raw.questions.map((q) => String(q)).filter(Boolean).slice(0, 3) : [];
  } catch {
    /* no artifact */
  }
  if (!questions.length) {
    console.log("No clarification questions written by the agent — nothing to ask.");
    return;
  }

  // Resolve the run's tenant + source under the owner (this job has no tenant context).
  const run = await runAsSystem((db) =>
    db.automationRun.findUnique({
      where: { id: runId },
      select: { tenantId: true, sourceType: true, sourceId: true, attempt: true },
    }),
  );
  if (!run) throw new Error(`AutomationRun ${runId} not found.`);

  const source: FeedbackSource =
    run.sourceType === "FEEDBACK_TICKET"
      ? { sourceType: "FEEDBACK_TICKET", sourceId: run.sourceId }
      : { sourceType: "ASSISTANT_FEEDBACK", sourceId: run.sourceId };

  const result: RequestClarificationResult = await requestClarificationCore({
    tenantId: run.tenantId,
    source,
    automationRunId: runId,
    round: run.attempt,
    questions,
  });

  if (result.ok) {
    console.log(`Asked the reporter (${result.ref}); run parked at AWAITING_CLARIFICATION.`);
    return;
  }
  if (result.reason === "ALREADY_OPEN") {
    console.log("A clarification is already open for this source — nothing to do.");
    return;
  }
  // No reporter to ask (deleted/anonymized) or source gone → fail the run so it doesn't hang;
  // the watchdog + /developer surface it for a human.
  console.log(`Cannot ask the reporter (${result.reason}); marking the run failed for human triage.`);
  await markAutomationRunFailed({ tenantId: run.tenantId, runId, error: `clarification not deliverable: ${result.reason}` });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
