-- Phase 14 Unit 4: the REMOVE_TAXPAID OperationType value, in a DEDICATED enum-only migration.
--
-- Postgres `ALTER TYPE ... ADD VALUE` makes the new label unusable until the adding statement has
-- COMMITTED, so it must land here (and commit) BEFORE removal-core.ts writes REMOVE_TAXPAID rows.
-- `IF NOT EXISTS` keeps it idempotent. Nothing else in this file references the value it just added.
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'REMOVE_TAXPAID';
