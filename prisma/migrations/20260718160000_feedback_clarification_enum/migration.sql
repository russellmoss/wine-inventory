-- Plan 079: add AWAITING_CLARIFICATION to FeedbackAutomationStatus in ISOLATION, before any
-- table/column/default references it. Postgres cannot use a newly-added enum value in the same
-- transaction it is added (the Windows/Neon enum rule), so this is its own migration.
ALTER TYPE "FeedbackAutomationStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CLARIFICATION';
