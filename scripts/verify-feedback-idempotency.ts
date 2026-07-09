import { FeedbackAutomationKind, FeedbackAutomationSource } from "@prisma/client";
import { automationIdempotencyKey } from "../src/lib/feedback/automation";

const a = automationIdempotencyKey({
  tenantId: "org_demo_winery",
  sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
  sourceId: "fb_1",
  kind: FeedbackAutomationKind.AGENTIC_FIX,
});
const b = automationIdempotencyKey({
  tenantId: "org_demo_winery",
  sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
  sourceId: "fb_1",
  kind: FeedbackAutomationKind.AGENTIC_FIX,
});
const c = automationIdempotencyKey({
  tenantId: "org_demo_winery",
  sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
  sourceId: "fb_1",
  kind: FeedbackAutomationKind.AGENTIC_FIX,
  attempt: 2,
});

console.log(a === b ? "✓ duplicate dispatch key collapses" : "✗ FAIL duplicate key changed");
console.log(a !== c ? "✓ retry attempt gets a new key" : "✗ FAIL retry key reused");
process.exit(a === b && a !== c ? 0 : 1);
