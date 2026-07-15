-- Plan 067 / PR B: one tenant-safe Linear handoff link per feedback source item.
-- The table starts empty, so no backfill is required.
CREATE TABLE "feedback_linear_link" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "id" TEXT NOT NULL,
  "ticketId" TEXT,
  "assistantFeedbackId" TEXT,
  "linearIssueKey" TEXT NOT NULL,
  "linearIssueUrl" TEXT NOT NULL,
  "linkedByUserId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "feedback_linear_link_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feedback_linear_link_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "feedback_linear_link_exactly_one_parent" CHECK (
    (CASE WHEN "ticketId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "assistantFeedbackId" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT "feedback_linear_link_ticket_fk"
    FOREIGN KEY ("tenantId", "ticketId") REFERENCES "feedback_ticket"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "feedback_linear_link_assistant_feedback_fk"
    FOREIGN KEY ("tenantId", "assistantFeedbackId") REFERENCES "assistant_feedback"("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "feedback_linear_link_tenantId_ticketId_key"
  ON "feedback_linear_link"("tenantId", "ticketId");
CREATE UNIQUE INDEX "feedback_linear_link_tenantId_assistantFeedbackId_key"
  ON "feedback_linear_link"("tenantId", "assistantFeedbackId");
CREATE INDEX "feedback_linear_link_tenantId_idx"
  ON "feedback_linear_link"("tenantId");
CREATE INDEX "feedback_linear_link_tenantId_linearIssueKey_idx"
  ON "feedback_linear_link"("tenantId", "linearIssueKey");
CREATE INDEX "feedback_linear_link_tenantId_linkedAt_idx"
  ON "feedback_linear_link"("tenantId", "linkedAt");

ALTER TABLE "feedback_linear_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_linear_link" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "feedback_linear_link"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Belt-and-braces grant. The owner role's ALTER DEFAULT PRIVILEGES already grants
-- DML to app_rls for newly created tables, but keeping this explicit makes the
-- migration independently auditable and safe on older environments.
GRANT SELECT, INSERT, UPDATE, DELETE ON "feedback_linear_link" TO app_rls;
