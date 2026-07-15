-- Plan 067 / PR B: support exact source queue predicates over the existing
-- automation_run composite parent foreign keys.
CREATE INDEX "automation_run_tenantId_ticketId_idx"
  ON "automation_run"("tenantId", "ticketId");

CREATE INDEX "automation_run_tenantId_assistantFeedbackId_idx"
  ON "automation_run"("tenantId", "assistantFeedbackId");

-- Exact tenant mode keyset-pages by (createdAt, id). PostgreSQL can backward-scan
-- these ascending indexes for the descending feed order; rating leads the assistant
-- index because only thumbs-down rows enter the developer queue.
CREATE INDEX "assistant_feedback_tenantId_rating_createdAt_id_idx"
  ON "assistant_feedback"("tenantId", "rating", "createdAt", "id");

CREATE INDEX "feedback_ticket_tenantId_createdAt_id_idx"
  ON "feedback_ticket"("tenantId", "createdAt", "id");
