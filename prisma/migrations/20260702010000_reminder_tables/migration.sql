-- plan-027 Unit 1: the two compliance-reminder tables (tenant-scoped; RLS in the next migration).
-- Deadlines are DERIVED (not stored); this persists only the per-user opt-in + the idempotent send log.

CREATE TABLE "compliance_reminder_preference" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "compliance_reminder_preference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compliance_reminder_log" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "mark" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "compliance_reminder_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_reminder_preference_tenantId_userId_key" ON "compliance_reminder_preference"("tenantId", "userId");
CREATE INDEX "compliance_reminder_preference_tenantId_idx" ON "compliance_reminder_preference"("tenantId");
CREATE UNIQUE INDEX "compliance_reminder_log_tenantId_form_periodKey_mark_recipi_key" ON "compliance_reminder_log"("tenantId", "form", "periodKey", "mark", "recipientUserId");
CREATE INDEX "compliance_reminder_log_tenantId_idx" ON "compliance_reminder_log"("tenantId");

-- Phase-12 checklist item 2: tenantId FK → organization(id) ON DELETE RESTRICT.
ALTER TABLE "compliance_reminder_preference" ADD CONSTRAINT "compliance_reminder_preference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_reminder_log" ADD CONSTRAINT "compliance_reminder_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The opt-in is a user setting → cascade on user delete. The log keeps recipientEmail as a durable
-- snapshot and has NO FK on recipientUserId, so audit rows survive a user deletion.
ALTER TABLE "compliance_reminder_preference" ADD CONSTRAINT "compliance_reminder_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
