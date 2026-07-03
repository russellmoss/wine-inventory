-- Phase 16 U6 — a read-only drift summary on commerce7_connection. The inventory cron compares ERP
-- on-hand vs Commerce7 available-for-sale per mapped variant and writes the summary here for the
-- dashboard to surface. Additive + nullable. It NEVER auto-corrects Commerce7 inventory — drift is
-- detected and surfaced for human review only.

ALTER TABLE "commerce7_connection" ADD COLUMN "driftSummary" JSONB;
ALTER TABLE "commerce7_connection" ADD COLUMN "driftCheckedAt" TIMESTAMP(3);
