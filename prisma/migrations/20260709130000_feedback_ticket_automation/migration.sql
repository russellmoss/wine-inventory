ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'IMPERSONATE';

CREATE TYPE "FeedbackAutomationMode" AS ENUM ('REPORT_ONLY', 'PLAN_MODE', 'AGENTIC_FIX');
CREATE TYPE "FeedbackTicketKind" AS ENUM ('BUG_REPORT', 'FEATURE_REQUEST');
CREATE TYPE "FeedbackSeverity" AS ENUM ('P0', 'P1', 'P2');
CREATE TYPE "FeedbackItemStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');
CREATE TYPE "FeedbackAutomationStatus" AS ENUM ('NOT_REQUESTED', 'AWAITING_APPROVAL', 'QUEUED', 'RUNNING', 'PLANNED', 'PR_OPENED', 'FAILED', 'SKIPPED');
CREATE TYPE "FeedbackAttachmentCaptureSource" AS ENUM ('AUTO_SCREENSHOT', 'MANUAL_UPLOAD');
CREATE TYPE "FeedbackAutomationSource" AS ENUM ('ASSISTANT_FEEDBACK', 'FEEDBACK_TICKET');
CREATE TYPE "FeedbackAutomationKind" AS ENUM ('PLAN', 'AGENTIC_FIX');

ALTER TABLE "app_settings"
  ADD COLUMN "assistantFeedbackMode" "FeedbackAutomationMode" NOT NULL DEFAULT 'AGENTIC_FIX',
  ADD COLUMN "bugReportMode" "FeedbackAutomationMode" NOT NULL DEFAULT 'REPORT_ONLY',
  ADD COLUMN "featureRequestMode" "FeedbackAutomationMode" NOT NULL DEFAULT 'REPORT_ONLY';

ALTER TABLE "assistant_feedback"
  ADD COLUMN "modeAtSubmission" "FeedbackAutomationMode" NOT NULL DEFAULT 'AGENTIC_FIX',
  ADD COLUMN "automationStatus" "FeedbackAutomationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "severity" "FeedbackSeverity",
  ADD COLUMN "githubIssueUrl" TEXT,
  ADD COLUMN "githubRunUrl" TEXT,
  ADD COLUMN "planMarkdown" TEXT,
  ADD COLUMN "planTitle" TEXT,
  ADD COLUMN "planGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "developerNotes" TEXT;

CREATE UNIQUE INDEX "assistant_feedback_tenantId_id_key" ON "assistant_feedback"("tenantId", "id");

CREATE TABLE "feedback_ticket" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "kind" "FeedbackTicketKind" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pageUrl" TEXT,
  "userAgent" TEXT,
  "debugContext" JSONB,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "modeAtSubmission" "FeedbackAutomationMode" NOT NULL,
  "automationStatus" "FeedbackAutomationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "status" "FeedbackItemStatus" NOT NULL DEFAULT 'NEW',
  "severity" "FeedbackSeverity",
  "githubIssueUrl" TEXT,
  "githubRunUrl" TEXT,
  "prUrl" TEXT,
  "planMarkdown" TEXT,
  "planTitle" TEXT,
  "planGeneratedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "developerNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_ticket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feedback_ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "feedback_ticket_tenantId_id_key" ON "feedback_ticket"("tenantId", "id");
CREATE INDEX "feedback_ticket_tenantId_kind_status_createdAt_idx" ON "feedback_ticket"("tenantId", "kind", "status", "createdAt");
CREATE INDEX "feedback_ticket_tenantId_severity_createdAt_idx" ON "feedback_ticket"("tenantId", "severity", "createdAt");
CREATE INDEX "feedback_ticket_tenantId_automationStatus_createdAt_idx" ON "feedback_ticket"("tenantId", "automationStatus", "createdAt");

CREATE TABLE "feedback_attachment" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "ticketId" TEXT,
  "assistantFeedbackId" TEXT,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "sha256" TEXT NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "annotatedBlobUrl" TEXT,
  "captureSource" "FeedbackAttachmentCaptureSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feedback_attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "feedback_attachment_exactly_one_parent" CHECK (
    (CASE WHEN "ticketId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "assistantFeedbackId" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT "feedback_attachment_ticket_fk" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "feedback_ticket"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "feedback_attachment_assistant_feedback_fk" FOREIGN KEY ("tenantId", "assistantFeedbackId") REFERENCES "assistant_feedback"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "feedback_attachment_tenantId_ticketId_idx" ON "feedback_attachment"("tenantId", "ticketId");
CREATE INDEX "feedback_attachment_tenantId_assistantFeedbackId_idx" ON "feedback_attachment"("tenantId", "assistantFeedbackId");
CREATE INDEX "feedback_attachment_tenantId_createdAt_idx" ON "feedback_attachment"("tenantId", "createdAt");

CREATE TABLE "automation_run" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "sourceType" "FeedbackAutomationSource" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "assistantFeedbackId" TEXT,
  "ticketId" TEXT,
  "kind" "FeedbackAutomationKind" NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "status" "FeedbackAutomationStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "workflowRunId" TEXT,
  "githubIssueNumber" INTEGER,
  "githubPrNumber" INTEGER,
  "githubUrl" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_run_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "automation_run_exactly_one_parent" CHECK (
    (CASE WHEN "ticketId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "assistantFeedbackId" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT "automation_run_ticket_fk" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "feedback_ticket"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_run_assistant_feedback_fk" FOREIGN KEY ("tenantId", "assistantFeedbackId") REFERENCES "assistant_feedback"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "automation_run_idempotencyKey_key" ON "automation_run"("idempotencyKey");
CREATE UNIQUE INDEX "automation_run_tenantId_sourceType_sourceId_kind_attempt_key" ON "automation_run"("tenantId", "sourceType", "sourceId", "kind", "attempt");
CREATE INDEX "automation_run_tenantId_status_createdAt_idx" ON "automation_run"("tenantId", "status", "createdAt");
CREATE INDEX "automation_run_tenantId_sourceType_sourceId_idx" ON "automation_run"("tenantId", "sourceType", "sourceId");

ALTER TABLE "feedback_ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_ticket" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "feedback_ticket" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "feedback_attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "feedback_attachment" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "automation_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "automation_run" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "feedback_ticket" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "feedback_attachment" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "automation_run" TO app_rls;
