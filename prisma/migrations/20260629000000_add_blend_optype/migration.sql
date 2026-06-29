-- Phase 5 blends: add the BLEND OperationType value in a DEDICATED enum-only migration.
-- Postgres `ALTER TYPE ... ADD VALUE` cannot run in the same transaction that adds it,
-- so the value must land (and commit) before the migration/code that writes BLEND rows
-- (Unit 5). IF NOT EXISTS keeps this idempotent.
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'BLEND';
