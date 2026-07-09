import { FeedbackAutomationKind, FeedbackAutomationMode, FeedbackAutomationSource, FeedbackTicketKind } from "@prisma/client";
import { automationIdempotencyKey, automationKindForMode } from "../src/lib/feedback/automation";

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

process.exit(failures === 0 ? 0 : 1);
