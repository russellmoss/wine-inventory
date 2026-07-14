import {
  FeedbackAutomationKind,
  FeedbackAutomationMode,
  FeedbackAutomationSource,
  FeedbackAutomationStatus,
  FeedbackTriageClass,
  FeedbackTicketKind,
} from "@prisma/client";
import {
  automationIdempotencyKey,
  automationKindForMode,
  deriveAutomationConflict,
  planRunNeedsReconciliation,
  repositoryDispatchEventForRun,
} from "../src/lib/feedback/automation";

let failures = 0;
function check(name: string, pass: boolean) {
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}`);
  if (!pass) failures++;
}

const key = automationIdempotencyKey({
  tenantId: "org_demo_winery",
  sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
  sourceId: "ticket_1",
  kind: FeedbackAutomationKind.PLAN,
});
check("idempotency key is stable", key === "org_demo_winery:FEEDBACK_TICKET:ticket_1:PLAN:1");
check("report-only creates no automation kind", automationKindForMode(FeedbackAutomationMode.REPORT_ONLY) === null);
check("plan mode maps to PLAN", automationKindForMode(FeedbackAutomationMode.PLAN_MODE) === FeedbackAutomationKind.PLAN);
check(
  "feature requests cannot map to AGENTIC_FIX",
  automationKindForMode(FeedbackAutomationMode.AGENTIC_FIX, { ticketKind: FeedbackTicketKind.FEATURE_REQUEST }) === null,
);
check(
  "bug reports can map to AGENTIC_FIX",
  automationKindForMode(FeedbackAutomationMode.AGENTIC_FIX, { ticketKind: FeedbackTicketKind.BUG_REPORT }) === FeedbackAutomationKind.AGENTIC_FIX,
);
check(
  "PLAN routes to feedback_plan",
  repositoryDispatchEventForRun({
    kind: FeedbackAutomationKind.PLAN,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
  }) === "feedback_plan",
);
check(
  "assistant fix routes to assistant_feedback",
  repositoryDispatchEventForRun({
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
  }) === "assistant_feedback",
);
check(
  "ticket fix routes to feedback_bug_fix",
  repositoryDispatchEventForRun({
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
  }) === "feedback_bug_fix",
);
check(
  "product gap with running fix exposes a conflict",
  deriveAutomationConflict(FeedbackTriageClass.PRODUCT_GAP, {
    id: "run_fix",
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    status: FeedbackAutomationStatus.RUNNING,
  })?.code === "PRODUCT_GAP_WITH_ACTIVE_FIX",
);
check(
  "awaiting fix can be superseded without a false conflict",
  deriveAutomationConflict(FeedbackTriageClass.PRODUCT_GAP, {
    id: "run_fix",
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    status: FeedbackAutomationStatus.AWAITING_APPROVAL,
  }) === null,
);
check(
  "stale running PLAN requires reconciliation",
  planRunNeedsReconciliation(
    {
      kind: FeedbackAutomationKind.PLAN,
      status: FeedbackAutomationStatus.RUNNING,
      claimedAt: new Date("2026-07-14T10:00:00.000Z"),
      githubUrl: null,
    },
    new Date("2026-07-14T12:00:01.000Z"),
  ),
);
check(
  "fresh running PLAN remains an in-flight idempotent success",
  !planRunNeedsReconciliation(
    {
      kind: FeedbackAutomationKind.PLAN,
      status: FeedbackAutomationStatus.RUNNING,
      claimedAt: new Date("2026-07-14T11:30:00.000Z"),
      githubUrl: null,
    },
    new Date("2026-07-14T12:00:00.000Z"),
  ),
);

process.exit(failures === 0 ? 0 : 1);
