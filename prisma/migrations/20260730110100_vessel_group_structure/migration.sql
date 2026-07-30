-- Cellarhand v2 Phase 7 (plan 106, Unit 2) — M2: give the group a type, a status, a location and
-- settings, and give the member a position. RFC-001 §4.2/§4.4/§4.5/§4.12/§4.13.
--
-- Hand-authored. `prisma migrate diff` is UNSAFE on this repo — it drops tenant FKs.
--
-- WHAT THIS FILE DELIBERATELY DOES **NOT** ADD: `addedAt` / `removedAt` on vessel_group_member.
-- The owner chose the work-order member snapshot over effective-dated membership (ADR 0014,
-- 2026-07-29). Invariant GROUP-3's corollary is explicit: "a membership table that grows date
-- columns later is the tripwire that this invariant has been quietly abandoned." If a future
-- migration adds them, that is a reversal of an owner decision and needs to say so out loud.
--
-- No new TABLE, so no new RLS block and no new grants: both tables were given ENABLE + FORCE +
-- tenant_isolation in 20260701001000_rls_policies (lines 182-188), and ALTER DEFAULT PRIVILEGES from
-- the app_rls-role migration already grants app_rls DML. A GRANT here would be a no-op; only a
-- REVOKE would change anything, and nothing here is append-only. Verified by the self-check at the
-- bottom rather than assumed.

-- ─────────────────────── 1) The composite-unique FK target RFC-001 §4.12 was missing ───────────────────────
-- vessel_group's only composite unique was (tenantId, name). BOTH of this phase's composite tenant
-- FKs target (tenantId, id) — vessel_group_member's back-reference below, and work_order_task's
-- vesselGroupId in Unit 5 — so without this the FKs cannot be created at all.
-- Two-step CREATE INDEX -> ADD CONSTRAINT ... USING INDEX is the house idiom (Phase-12 checklist 5).
CREATE UNIQUE INDEX "vessel_group_tenantId_id_key" ON "vessel_group"("tenantId", "id");
ALTER TABLE "vessel_group" ADD CONSTRAINT "vessel_group_tenantId_id_key" UNIQUE USING INDEX "vessel_group_tenantId_id_key";

-- ─────────────────────── 2) vessel_group columns ───────────────────────
ALTER TABLE "vessel_group"
  ADD COLUMN "type"       "VesselGroupType"   NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN "status"     "VesselGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  -- D4: the hall/room is a real Location; the RACK is not. Location.kind is
  -- cellar/warehouse/crush_pad/lab/bottling/external/other (schema.prisma:296) — racks are not
  -- modelled there and inventing a `kind='rack'` would put shelving in the same registry as a
  -- bonded warehouse. So: hall by FK, rack by text.
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "rackLabel"  TEXT,
  -- RFC-001 §4.4: topping interval + source, keg preset, SO2 target, sampling rule, default crew,
  -- default work-order template. These are DEFAULTS FOR GENERATED WORK ORDERS, never a live
  -- constraint on what a person may do — a cellar hand can always top a barrel outside its interval.
  -- Json rather than eight columns because the set is explicitly open and none of it is queried.
  ADD COLUMN "settings"   JSONB,
  ADD COLUMN "updatedAt"  TIMESTAMP(3);

-- Backfill. Both tables hold 0 rows on all 11 tenants (re-verified read-only 2026-07-30), so the
-- DEFAULTs above have already done this. The statements are written anyway so the migration is
-- CORRECT if it is ever replayed somewhere non-empty — a migration that only works against an empty
-- table is a migration that silently corrupts the first database that isn't.
-- `type` needs no backfill statement: the column arrives NOT NULL DEFAULT 'OPERATIONAL', so every
-- pre-existing row is already OPERATIONAL per RFC-001 §4.2 ("existing rows migrate to OPERATIONAL").
-- `status` DOES need one — its default is ACTIVE, which is wrong for any row with isActive = false.
-- The ::"VesselGroupStatus" cast is required, not decorative: a bare CASE yields `text` and Postgres
-- refuses the assignment (42804). Caught by test-applying this file to a disposable Neon branch.
UPDATE "vessel_group" SET "status" = (CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'ARCHIVED' END)::"VesselGroupStatus";
UPDATE "vessel_group" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

CREATE INDEX "vessel_group_tenantId_status_type_idx" ON "vessel_group"("tenantId", "status", "type");
CREATE INDEX "vessel_group_tenantId_locationId_idx" ON "vessel_group"("tenantId", "locationId");

-- ─────────────────────── 3) vessel_group_member columns ───────────────────────
ALTER TABLE "vessel_group_member"
  -- RFC-001 §4.3: positions are per group, contiguous, and reorderable. An unordered set means a
  -- crew that breaks off mid-round cannot resume deterministically ("barrel 10 of 22").
  ADD COLUMN "position"  INTEGER NOT NULL DEFAULT 0,
  -- DENORMALISED from vessel_group.type, and this is the resolution of the one thing plan 106 Unit 3
  -- flagged as genuinely under-specified in RFC-001 §6.1. The OD-3 index must be
  -- `UNIQUE (tenantId, vesselId) WHERE type = 'OPERATIONAL'`, but a PARTIAL INDEX PREDICATE CANNOT
  -- REFERENCE ANOTHER TABLE. Three formulations were possible:
  --   (a) denormalise type onto the member row  <- CHOSEN
  --   (b) a generated column — same denormalisation, but generated columns cannot reference another
  --       table either, so it does not actually solve anything
  --   (c) an EXCLUDE/trigger-based check — enforcement in procedural code, which is exactly the
  --       "guard that has never gone red" failure the plan's §6 forbids
  -- (a) is the only one where the constraint is a real unique index. The denormalisation is kept
  -- honest by TWO triggers below, not by app discipline: app code never writes this column.
  ADD COLUMN "groupType" "VesselGroupType" NOT NULL DEFAULT 'OPERATIONAL';

-- Backfill (again: 0 rows today, written for replay correctness).
-- Position by vessel-code natural sort, per RFC-001 §4.13. `~ '^\D*\d'` splits a code like "B101"
-- into its alpha prefix and its numeric tail so B9 sorts before B10 — a plain text sort would not.
WITH ordered AS (
  SELECT m."id",
         ROW_NUMBER() OVER (
           PARTITION BY m."tenantId", m."groupId"
           ORDER BY  regexp_replace(v."code", '\d+$', ''),
                     NULLIF(substring(v."code" FROM '\d+$'), '')::bigint NULLS FIRST,
                     v."code"
         ) AS pos
  FROM "vessel_group_member" m
  JOIN "vessel" v ON v."id" = m."vesselId"
)
UPDATE "vessel_group_member" m SET "position" = ordered.pos FROM ordered WHERE ordered."id" = m."id";

UPDATE "vessel_group_member" m
   SET "groupType" = g."type"
  FROM "vessel_group" g
 WHERE g."id" = m."groupId" AND g."tenantId" = m."tenantId";

CREATE INDEX "vessel_group_member_tenantId_groupId_position_idx" ON "vessel_group_member"("tenantId", "groupId", "position");

-- ─────────────────────── 4) Composite tenant FKs (Phase-12 checklist step 5) ───────────────────────
-- BOTH are ON DELETE CASCADE, which OVERRIDES RFC-000 §2's "ON DELETE RESTRICT" (plan 106 D6/F5).
-- The reason is not preference: vessel_group_member_groupId_fkey has been ON DELETE CASCADE since
-- 20260627110318_lot_ledger_spine:193, and Postgres evaluates EVERY foreign key. A RESTRICT
-- composite sitting alongside a CASCADE scalar does not "tighten" anything — it makes deleting any
-- non-empty group fail outright. The house convention is that a composite tenant FK MATCHES its
-- scalar sibling's delete rule (vessel_lot -> vessel; blend_trial_component -> blend_trial, the
-- identical parent/child shape).
ALTER TABLE "vessel_group_member" ADD CONSTRAINT "vessel_group_member_tenantId_groupId_fkey"
  FOREIGN KEY ("tenantId", "groupId") REFERENCES "vessel_group"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vessel_group_member" ADD CONSTRAINT "vessel_group_member_tenantId_vesselId_fkey"
  FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The group's hall. RESTRICT matches the house posture for every other composite location FK
-- (20260719140000_location_composite_tenant_fk, 20260719160000_finished_good_receipt): a location
-- that something still points at is not silently deletable.
ALTER TABLE "vessel_group" ADD CONSTRAINT "vessel_group_tenantId_locationId_fkey"
  FOREIGN KEY ("tenantId", "locationId") REFERENCES "location"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────── 5) status <-> isActive stay honest ───────────────────────
-- `status` is authoritative; `isActive` survives as a legacy mirror because live read paths still
-- filter on it (src/lib/vessels/groups.ts listGroups, and through it resolveGroupByName and the
-- whole work-order NL group resolver). Rather than leave two sources of truth and hope, the CHECK
-- makes drift impossible and the trigger makes either writer correct.
ALTER TABLE "vessel_group" ADD CONSTRAINT "vessel_group_status_matches_isActive"
  CHECK (("status" = 'ACTIVE') = "isActive");

CREATE OR REPLACE FUNCTION vessel_group_sync_status() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- On insert either column may be the one the caller meant. An explicit non-default wins;
    -- when both are default the row is ACTIVE/true and both agree already.
    IF NEW."status" = 'ACTIVE' AND NEW."isActive" = false THEN
      NEW."status" := 'ARCHIVED';
    END IF;
    NEW."isActive" := (NEW."status" = 'ACTIVE');
  ELSE
    -- On update, whichever column the caller actually changed is the intent. `status` wins when both
    -- moved, because it is the authoritative one.
    IF NEW."status" IS DISTINCT FROM OLD."status" THEN
      NEW."isActive" := (NEW."status" = 'ACTIVE');
    ELSIF NEW."isActive" IS DISTINCT FROM OLD."isActive" THEN
      NEW."status" := CASE WHEN NEW."isActive" THEN 'ACTIVE' ELSE 'ARCHIVED' END;
    END IF;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER vessel_group_sync_status_trg BEFORE INSERT OR UPDATE ON "vessel_group"
  FOR EACH ROW EXECUTE FUNCTION vessel_group_sync_status();

-- ─────────────────────── 6) the denormalised groupType stays honest ───────────────────────
-- GROUP-1 is only as true as this column. App code never sets it: the BEFORE trigger overwrites
-- whatever was supplied with the group's real type, so a caller cannot smuggle a member into the
-- OPERATIONAL partial index (or out of it) by lying. This is what makes (a) above safe.
CREATE OR REPLACE FUNCTION vessel_group_member_sync_type() RETURNS trigger AS $$
DECLARE
  g_type "VesselGroupType";
BEGIN
  SELECT g."type" INTO g_type FROM "vessel_group" g
   WHERE g."id" = NEW."groupId" AND g."tenantId" = NEW."tenantId";
  IF g_type IS NULL THEN
    -- Unreachable while the composite FK above holds; kept so a future FK change fails loudly
    -- instead of silently defaulting a member to OPERATIONAL and widening the unique index.
    RAISE EXCEPTION 'vessel_group_member references group % that does not exist in tenant %', NEW."groupId", NEW."tenantId";
  END IF;
  NEW."groupType" := g_type;

  -- Contiguity without making every legacy writer pass a position. createMany() in
  -- src/lib/vessels/groups.ts inserts {groupId, vesselId} only; without this it would land every
  -- member at 0 and the walk order would be undefined. 0 is the sentinel for "you didn't say".
  IF TG_OP = 'INSERT' AND NEW."position" = 0 THEN
    SELECT COALESCE(MAX(m."position"), 0) + 1 INTO NEW."position"
      FROM "vessel_group_member" m
     WHERE m."tenantId" = NEW."tenantId" AND m."groupId" = NEW."groupId";
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER vessel_group_member_sync_type_trg BEFORE INSERT OR UPDATE ON "vessel_group_member"
  FOR EACH ROW EXECUTE FUNCTION vessel_group_member_sync_type();

-- Retyping a group has to carry its members with it, or the partial index would be enforced against
-- a stale type. AFTER, statement-visible, and a no-op when `type` did not move.
CREATE OR REPLACE FUNCTION vessel_group_propagate_type() RETURNS trigger AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type" THEN
    UPDATE "vessel_group_member" SET "groupType" = NEW."type"
     WHERE "tenantId" = NEW."tenantId" AND "groupId" = NEW."id";
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER vessel_group_propagate_type_trg AFTER UPDATE ON "vessel_group"
  FOR EACH ROW EXECUTE FUNCTION vessel_group_propagate_type();

-- ─────────────────────── 7) Self-verify ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vessel_group_tenantId_id_key') THEN
    RAISE EXCEPTION 'vessel_group is missing the (tenantId, id) composite-unique FK target (RFC-001 §4.12)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vessel_group_member_tenantId_groupId_fkey') THEN
    RAISE EXCEPTION 'composite tenant FK vessel_group_member -> vessel_group missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vessel_group_member_tenantId_vesselId_fkey') THEN
    RAISE EXCEPTION 'composite tenant FK vessel_group_member -> vessel missing';
  END IF;
  -- F5: a RESTRICT composite alongside the CASCADE scalar makes deleting a non-empty group fail.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname IN ('vessel_group_member_tenantId_groupId_fkey', 'vessel_group_member_tenantId_vesselId_fkey')
       AND confdeltype <> 'c'
  ) THEN
    RAISE EXCEPTION 'both vessel_group_member composite FKs must be ON DELETE CASCADE (plan 106 D6/F5)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vessel_group_member_sync_type_trg') THEN
    RAISE EXCEPTION 'groupType sync trigger missing — GROUP-1 partial index would be enforced on an app-writable column';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vessel_group_propagate_type_trg') THEN
    RAISE EXCEPTION 'groupType propagation trigger missing — retyping a group would leave members stale';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vessel_group_sync_status_trg') THEN
    RAISE EXCEPTION 'status/isActive sync trigger missing';
  END IF;
  -- ADR 0014 / GROUP-3 corollary. This is a tripwire, not a formality.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vessel_group_member'
       AND column_name IN ('addedAt', 'removedAt')
  ) THEN
    RAISE EXCEPTION 'vessel_group_member must NOT carry addedAt/removedAt — the owner chose the work-order snapshot (ADR 0014, GROUP-3)';
  END IF;
  -- RLS came from 20260701001000_rls_policies; assert rather than assume (TENANT-1).
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname IN ('vessel_group', 'vessel_group_member')
         AND c.relrowsecurity AND c.relforcerowsecurity) <> 2 THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on both vessel_group tables';
  END IF;
END
$$;
