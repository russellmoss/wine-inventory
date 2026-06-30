-- Phase 6 Unit 1: state-transform OperationType values + the orthogonal fermentation
-- state enums, in a DEDICATED enum-only migration.
--
-- Postgres `ALTER TYPE ... ADD VALUE` makes the new label unusable until the adding
-- statement has COMMITTED, so the values must land here (and commit) BEFORE the
-- migration/code that writes CRUSH/PRESS/SAIGNEE rows (Units 3/4). `IF NOT EXISTS`
-- keeps each ADD idempotent. The two new enums are plain CREATE TYPE (no such rule;
-- they don't reference OperationType), and the columns that USE them (Lot.afState /
-- Lot.mlfState) are added in Unit 2 — not here — so nothing in this file uses a value
-- it just added.

ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'CRUSH';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'PRESS';
ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS 'SAIGNEE';

-- Three orthogonal fermentation vectors (council C1): alcoholic + malolactic states.
-- STUCK is DERIVED from the Brix trend (council C3), so it is NOT an enum value.
CREATE TYPE "AlcoholicFermState" AS ENUM ('NONE', 'ACTIVE', 'DRY');
CREATE TYPE "MalolacticState" AS ENUM ('NONE', 'ACTIVE', 'COMPLETE');
