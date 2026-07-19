-- Plan 079: FeedbackClarification (one clarification round asked of a bug reporter), polymorphic
-- over both feedback sources (mirrors AutomationRun / FeedbackAttachment). RLS lands next migration.
-- Also adds currentAutomationRunId to the two source tables so a source row's status can be derived
-- from its CURRENT run once multiple runs exist across clarification rounds (council C-3.5).

CREATE TYPE "FeedbackClarificationStatus" AS ENUM ('OPEN', 'ANSWERED', 'CANCELLED');

ALTER TABLE "feedback_ticket" ADD COLUMN "currentAutomationRunId" TEXT;
ALTER TABLE "assistant_feedback" ADD COLUMN "currentAutomationRunId" TEXT;

CREATE TABLE "feedback_clarification" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "sourceType" "FeedbackAutomationSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ticketId" TEXT,
    "assistantFeedbackId" TEXT,
    "automationRunId" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "ref" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "dmThreadId" TEXT,
    "dmMessageId" TEXT,
    "questions" TEXT NOT NULL,
    "askedByUserId" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FeedbackClarificationStatus" NOT NULL DEFAULT 'OPEN',
    "answerBody" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feedback_clarification_pkey" PRIMARY KEY ("id")
);

-- Uniques declared on the Prisma model (mapped by column-combo at runtime; NULL automationRunId
-- rows are allowed to coexist since NULLs are distinct in a unique index).
CREATE UNIQUE INDEX "feedback_clarification_tenantId_id_key" ON "feedback_clarification"("tenantId", "id");
CREATE UNIQUE INDEX "feedback_clarification_tenantId_ref_key" ON "feedback_clarification"("tenantId", "ref");
CREATE UNIQUE INDEX "feedback_clarification_tenantId_automationRunId_key" ON "feedback_clarification"("tenantId", "automationRunId");
CREATE INDEX "fclar_src_history_idx" ON "feedback_clarification"("tenantId", "sourceType", "sourceId", "askedAt");
CREATE INDEX "fclar_thread_status_idx" ON "feedback_clarification"("tenantId", "dmThreadId", "status");
CREATE INDEX "fclar_reporter_status_idx" ON "feedback_clarification"("tenantId", "reporterUserId", "status");
CREATE INDEX "fclar_tenant_ticket_idx" ON "feedback_clarification"("tenantId", "ticketId");
CREATE INDEX "fclar_tenant_assistant_idx" ON "feedback_clarification"("tenantId", "assistantFeedbackId");

-- Promote (tenantId, id) to a constraint (FK-target parity with the other feedback tables).
ALTER TABLE "feedback_clarification" ADD CONSTRAINT "feedback_clarification_tenantId_id_key" UNIQUE USING INDEX "feedback_clarification_tenantId_id_key";

-- Tenant pin + composite FKs to both source tables (cascade with the source row).
ALTER TABLE "feedback_clarification" ADD CONSTRAINT "feedback_clarification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback_clarification" ADD CONSTRAINT "feedback_clarification_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "feedback_ticket"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_clarification" ADD CONSTRAINT "feedback_clarification_tenantId_assistantFeedbackId_fkey" FOREIGN KEY ("tenantId", "assistantFeedbackId") REFERENCES "assistant_feedback"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Council C-1: at most ONE OPEN clarification per SOURCE (per ticket / per assistant-feedback).
-- Partial unique — Prisma can't express it, so it's raw SQL. Enforced by the DB, not app code.
CREATE UNIQUE INDEX "feedback_clarification_one_open_per_source"
  ON "feedback_clarification"("tenantId", "sourceType", "sourceId")
  WHERE "status" = 'OPEN';

-- Council C-3.4: exactly one of ticketId/assistantFeedbackId is set, matching sourceType, and sourceId
-- mirrors it (no orphaned/mismatched polymorphic rows).
ALTER TABLE "feedback_clarification" ADD CONSTRAINT "feedback_clarification_source_exactly_one"
  CHECK (
    ("sourceType" = 'FEEDBACK_TICKET'    AND "ticketId" IS NOT NULL AND "assistantFeedbackId" IS NULL AND "sourceId" = "ticketId")
    OR
    ("sourceType" = 'ASSISTANT_FEEDBACK' AND "assistantFeedbackId" IS NOT NULL AND "ticketId" IS NULL AND "sourceId" = "assistantFeedbackId")
  );
