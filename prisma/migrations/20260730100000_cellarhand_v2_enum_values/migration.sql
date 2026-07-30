-- Cellarhand v2 · Plan 106 · M1 — the ISOLATED enum migration (RFC-000 §1).
--
-- THE RULE (the Windows/Postgres enum rule; this schema documents it ~7 times for OperationType
-- alone and once for AuditAction): Postgres refuses `ALTER TYPE ... ADD VALUE` in the same
-- transaction as code, a column default, or a row write that USES the value —
-- `ERROR: unsafe use of new value`. It passes CI and fails ON DEPLOY. Prisma runs each migration in
-- its own transaction, so the values must land, COMMIT, and DEPLOY before anything references them.
-- Nothing else belongs in this file.
--
-- Batched into ONE migration deliberately (RFC-000 §1): splitting these across two files buys two
-- deploy cycles for zero benefit. All four values are decided:
--
--   CaptureMethod.DERIVED  — RFC-003. A quantity computed rather than read off an instrument.
--   CaptureMethod.NOMINAL  — RFC-003 §3.1/§3.6, owner decision OD-4 (2026-07-29). The stamped keg
--                            size: accepted as-is, badged *nominal*, NEVER *measured*. Provenance
--                            becomes a TRINARY — measured / nominal / estimated — which is why this
--                            is two values and not one.
--   VesselType.KEG         — RFC-002 / ADR 0013. A keg is a Vessel in the source position of a
--                            transfer, not a new table. NO handoff document mentioned this enum was
--                            missing; forgetting it until M4 is the single most likely way Phase 8
--                            stalls mid-phase.
--   VesselType.BIN         — free ride. The coalescence register names KEG+BIN as one additive-enum
--                            slice; taking BIN now avoids a second deploy cycle later.
--
-- ONE-WAY DOOR: Postgres cannot drop an enum value. Rollback is code-only ("stop writing it").
-- Everything downstream in M2-M6 rolls back to zero data effect.
--
-- NOTHING IN PHASE 7 MAY WRITE ANY OF THESE FOUR VALUES. `TYPES` in src/lib/vessels/actions.ts is a
-- deliberately NARROWER local union (["BARREL","TANK"]) and is what stops anyone creating a KEG or
-- BIN vessel before Phase 8 exists — widening it here would be the bug.
--
-- IF NOT EXISTS keeps this idempotent (the Windows enum rule).

ALTER TYPE "CaptureMethod" ADD VALUE IF NOT EXISTS 'DERIVED';
ALTER TYPE "CaptureMethod" ADD VALUE IF NOT EXISTS 'NOMINAL';
ALTER TYPE "VesselType" ADD VALUE IF NOT EXISTS 'KEG';
ALTER TYPE "VesselType" ADD VALUE IF NOT EXISTS 'BIN';
