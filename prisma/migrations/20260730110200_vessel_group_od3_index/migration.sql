-- Cellarhand v2 Phase 7 (plan 106, Unit 3) — M3: make GROUP-1 (OD-3) true AT THE DATABASE.
--
-- "A vessel belongs to at most one OPERATIONAL VesselGroup at a time." Without it the same barrel
-- can be scheduled into two competing topping rounds and double-topped. RFC-001 classes this as a
-- correctness gap, not an ergonomics one, and it is equally wrong at 22 barrels and at 8,142.
--
-- SEPARATE FILE FROM THE STRUCTURE MIGRATION ON PURPOSE. Rollback is `DROP INDEX` and nothing else
-- — no data change, no column drop, no dependency on M2's rollback. That independence is exactly
-- why enforcing now is the safe choice rather than the bold one.
--
-- ENFORCED IMMEDIATELY, reversing the pre-amendment RFC-001 §4.13 ("Do not enforce it in the
-- migration. Report violations, let an admin resolve them, enable the constraint afterwards"). That
-- was prudence against UNKNOWN data. The data is known: 0 groups, 0 memberships, 0 vessels in 2+
-- groups, across all 11 tenants (re-verified read-only 2026-07-30). A report-don't-enforce phase
-- here buys nothing and costs a second migration plus a window in which the constraint is
-- documented but not true.

-- WHY THE PREDICATE READS `groupType` AND NOT `type`: RFC-001 §6.1 sketches this index as
-- `UNIQUE (tenantId, vesselId) WHERE type = 'OPERATIONAL'`, but `type` lives on vessel_group and a
-- PARTIAL INDEX PREDICATE CANNOT REFERENCE ANOTHER TABLE. The previous migration resolved that by
-- denormalising the group's type onto the member row and making TWO triggers — not app discipline —
-- responsible for keeping it true (BEFORE INSERT OR UPDATE on the member overwrites whatever the
-- caller supplied; AFTER UPDATE on the group propagates a retype to its members). So this index is
-- enforced against a column no application code can write.
--
-- NO `removedAt IS NULL` CLAUSE, because there is no removedAt. The owner chose the work-order
-- member snapshot over effective-dated membership (ADR 0014); see GROUP-1's note.
--
-- Does NOT conflict with the existing @@unique([tenantId, groupId, vesselId]): that one forbids the
-- same vessel twice in the SAME group, this one forbids it in two DIFFERENT operational groups.
CREATE UNIQUE INDEX "vessel_group_member_one_operational_group_per_vessel"
  ON "vessel_group_member" ("tenantId", "vesselId")
  WHERE "groupType" = 'OPERATIONAL';

COMMENT ON INDEX "vessel_group_member_one_operational_group_per_vessel" IS
  'GROUP-1 / OD-3 (RFC-001 §4.2, §4.13). Guard: npm run verify:group-membership.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'vessel_group_member_one_operational_group_per_vessel'
  ) THEN
    RAISE EXCEPTION 'GROUP-1 partial unique index was not created';
  END IF;
  -- A partial index over a column the app can write is not enforcement. Fail the migration if the
  -- trigger that owns groupType has gone missing.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vessel_group_member_sync_type_trg') THEN
    RAISE EXCEPTION 'groupType sync trigger missing — the GROUP-1 index would be enforced on an app-writable column';
  END IF;
END
$$;
