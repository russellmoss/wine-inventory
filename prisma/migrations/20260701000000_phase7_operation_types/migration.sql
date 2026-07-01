-- Phase 7 Unit 1: sparkling OperationType values, in a DEDICATED enum-only migration.
--
-- Postgres `ALTER TYPE ... ADD VALUE` makes the new label unusable until the adding
-- statement has COMMITTED, so these values must land here (and commit) BEFORE the
-- migration/code that writes TIRAGE/RIDDLING/DISGORGEMENT/DOSAGE/FINISH rows
-- (Units 5–9). `IF NOT EXISTS` keeps each ADD idempotent. Nothing else in this file
-- references the values it just added. The brand-new Phase 7 enums (LedgerBucket,
-- SparklingMethod, BottleStage, DosageStyle) are plain CREATE TYPEs and land with the
-- tables in Unit 2 — no such rule applies to them.
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'TIRAGE';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'RIDDLING';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'DISGORGEMENT';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'DOSAGE';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'FINISH';
