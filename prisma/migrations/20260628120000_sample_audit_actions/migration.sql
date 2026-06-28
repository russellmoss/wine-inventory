-- Phase 4 sample lifecycle: add the new AuditAction enum values in a DEDICATED migration.
-- Postgres `ALTER TYPE ... ADD VALUE` can't be used in the same transaction that adds it,
-- so the values must land (and commit) before the runtime writes audit rows using them.
-- IF NOT EXISTS keeps this idempotent. Panel/tasting create+void reuse CREATE/DELETE.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SAMPLE_PULLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SAMPLE_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SAMPLE_ATTACHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SAMPLE_CANCELLED';
