-- Phase 14 plan-026 Unit 1: add the SEMIMONTHLY wine-excise-return cadence to ReportCadence.
-- ISOLATED on purpose (Windows enum rule): Postgres forbids USING a freshly-added enum value in the
-- same transaction it was added, and the next migration sets DEFAULT 'SEMIMONTHLY' on a column. This
-- migration commits the value alone; 20260701040100 then references it safely.
ALTER TYPE "ReportCadence" ADD VALUE IF NOT EXISTS 'SEMIMONTHLY';
