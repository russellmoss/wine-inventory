-- Plan 059: first-class TRIAGED DISPOSITION on feedback (the bug-triage goalie assigns it).
-- A fresh CREATE TYPE + nullable columns with NO default → safe to create the enum and add the
-- columns in ONE migration. The Windows "enum alone" rule only applies to ALTER TYPE ADD VALUE
-- where the new value is used as a column default in the same transaction (not the case here).
-- Additive + nullable → no backfill; existing rows stay NULL (= untriaged). RLS/policies unchanged
-- (row-level, so new columns are covered by the existing tenant_isolation policy); table-level
-- app_rls GRANTs already cover future columns.

-- CreateEnum
CREATE TYPE "FeedbackTriageClass" AS ENUM ('DEFECT', 'MODEL_BEHAVIOR', 'PRODUCT_GAP', 'NOT_A_BUG', 'UNCLEAR');

-- AlterTable
ALTER TABLE "assistant_feedback" ADD COLUMN "triageClass" "FeedbackTriageClass";
ALTER TABLE "feedback_ticket" ADD COLUMN "triageClass" "FeedbackTriageClass";

-- CreateIndex
CREATE INDEX "assistant_feedback_tenantId_triageClass_idx" ON "assistant_feedback"("tenantId", "triageClass");
CREATE INDEX "feedback_ticket_tenantId_triageClass_createdAt_idx" ON "feedback_ticket"("tenantId", "triageClass", "createdAt");
