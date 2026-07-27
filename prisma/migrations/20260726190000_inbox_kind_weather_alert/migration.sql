-- Plan 096 Phase 3 Unit 18 — the ISOLATED enum migration (the Windows/Postgres enum rule, Phase 14
-- SEMIMONTHLY lesson): the ALTER TYPE ships alone, FIRST in the phase, before any column default or
-- code path references the value. Prisma runs each migration in its own transaction, so later
-- migrations in this deploy may use WEATHER_ALERT. Nothing else belongs in this file.
ALTER TYPE "InboxKind" ADD VALUE 'WEATHER_ALERT';
