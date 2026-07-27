-- Spray Intelligence S5a — the append-only latent-infection ledger.
--
-- WHY THIS TABLE EXISTS: a clean scouting pass must not clear an infection event that is still
-- incubating. Fedele et al. 2020 (Plant Disease 104(5):1291-1297) scored a Botrytis model at 65%
-- against field assessment but >87% against post-harvest incubation assays of SYMPTOMLESS berries
-- — the model was correctly predicting infections scouting could not see. "Nobody saw anything" is
-- not "there is nothing there" (plan KD-5).
--
-- Built to the full Phase-12 tenant checklist (AGENTS.md), SQL posture copied from
-- 20260726200000_weather_alert_state and the append-only posture from 20260727010000_spray_record.
--
-- FOUR SCHEMA CORRECTIONS FROM COUNCIL, all real defects in the plan's first draft:
--   C4 event identity — "keyed on pathogen x host organ" is a DISCRIMINATOR, not an identity. A
--      block can carry several episodes of the same pathogen and organ in one season, and a
--      correction needs something to point at. Hence logicalEventId (the stream) + an immutable row
--      id per append + supersedesRowId / reversesRowId. Current state is the LATEST ROW PER
--      logicalEventId, never a lookup by pathogen/organ.
--   C5 append-only is half-enforced — a BEFORE UPDATE trigger does not stop DELETE, and
--      withWriteRetry on an insert path double-inserts. Hence: UPDATE/DELETE are NEVER GRANTED to
--      app_rls (the grant is the real enforcement; the triggers are defence in depth), and every
--      command carries a deterministic idempotency key with a unique index.
--   C7 no epistemic state in a NULL — each projected transition ships with a projection KIND and a
--      CHECK tying the two together.
--   C6/D-1 no premature abstraction — the FIXED_WINDOW arm's fields are explicit scalar columns,
--      not a jsonb payload, which removes the weak-Prisma-types / unindexable-arm-fields objection
--      at no cost now that the enum ships only the arms S5a implements.

-- ─────────────────────────────── 1) latent_infection_event ───────────────────────────────
CREATE TABLE "latent_infection_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    -- C4: the stream. Every append about the same infection episode shares this.
    "logicalEventId" TEXT NOT NULL,
    -- Append ordinal within the stream, 1-based. Deterministic ordering that does not depend on
    -- clock resolution, and the unique below makes a concurrent double-append fail loudly.
    "seq" INTEGER NOT NULL,
    "blockId" TEXT NOT NULL,
    "pathogen" "InfectionPathogen" NOT NULL,
    "hostOrgan" "InfectionHostOrgan" NOT NULL,
    "status" "InfectionEventStatus" NOT NULL,
    "resolutionKind" "InfectionResolutionKind" NOT NULL,
    -- The day the infection is believed to have occurred. Everything else is projected from it.
    "infectionOccurredOn" DATE NOT NULL,

    -- ── KD-3b: TWO transitions, because "visible" and "infectious" are different states and only
    -- one of them is what a scout sees. Collapsing them to one date would leave the ledger unable to
    -- answer "is this block currently a source of inoculum?" — the question S6 and S7a will ask it.
    "symptomExpectedAt" DATE,
    "symptomProjectionKind" "InfectionProjectionKind" NOT NULL,
    "symptomBasis" TEXT,
    "infectiousExpectedAt" DATE,
    "infectiousProjectionKind" "InfectionProjectionKind" NOT NULL,
    "infectiousBasis" TEXT,

    -- ── FIXED_WINDOW arm (explicit scalars, C5e/D-1) ──
    -- KD-4, and this is the safety bug council caught: the two bounds are used in OPPOSITE
    -- directions, because the ledger answers two questions whose safe directions are opposite.
    --   latentShortDays -> infectiousExpectedAt. Assuming LATER under-warns: a grower waits, the
    --     pathogen sporulates on day 5, and a secondary epidemic seeds while the ledger still reads
    --     "incubating". The powdery literature clusters at ~5 d (Delp 1954; Chellemi & Marois 1991).
    --   latentLongDays  -> expiresOn. Closing EARLIER declares a block clean prematurely. Bendek et
    --     al. 2007 reports 13-14 d at 20-23 C, roughly double, most likely a different endpoint.
    -- The 2x literature conflict is therefore NOT resolved into one number. It becomes the two ends
    -- of one interval, each used where it is safe. Never averaged (rule 3.3).
    "latentShortDays" INTEGER,
    "latentLongDays" INTEGER,
    "expiresOn" DATE,

    "resolvedOn" DATE,
    "resolutionNote" TEXT,

    -- ── corrections are appends, never edits (SPRAY-1 / SPRAY-5 precedent) ──
    "supersedesRowId" TEXT,
    "reversesRowId" TEXT,

    -- ── evidence. D19: reference the observer and the observation by opaque id only; no personal
    -- data and no free-text identity ever enters this payload. Not an FK: the referenced surface
    -- differs by evidenceSource, so a typed FK here would be a lie.
    "evidenceSource" "InfectionEvidenceSource" NOT NULL,
    "observationRef" TEXT,

    -- ── idempotency (C5). withWriteRetry wraps the whole SERIALIZABLE tx and WILL re-run it on a
    -- 40001; without this a retry appends the event twice. Same commandId + same hash returns the
    -- original row; same commandId + different hash is rejected. Reuses S3a's computeRequestHash.
    "commandId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,

    -- ── attribution triplet, as every event row in this codebase carries ──
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "latent_infection_event_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────── 2) Indexes ───────────────────────────────
CREATE UNIQUE INDEX "latent_infection_event_tenantId_id_key" ON "latent_infection_event"("tenantId", "id");
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "latent_infection_event_tenantId_id_key" UNIQUE USING INDEX "latent_infection_event_tenantId_id_key";
CREATE INDEX "latent_infection_event_tenantId_idx" ON "latent_infection_event"("tenantId");

-- The "latest row per stream" read path (council: Prisma is poor at this; make it cheap).
CREATE INDEX "lie_tenant_logical_seq_idx" ON "latent_infection_event"("tenantId", "logicalEventId", "seq" DESC);
-- No two appends may claim the same ordinal in the same stream. This is the concurrency guard that
-- makes "current state = MAX(seq)" safe under two racing writers.
CREATE UNIQUE INDEX "lie_tenant_logical_seq_key" ON "latent_infection_event"("tenantId", "logicalEventId", "seq");
-- Idempotency (C5): one row per command, per tenant.
CREATE UNIQUE INDEX "lie_tenant_command_key" ON "latent_infection_event"("tenantId", "commandId");
-- The block-scoped browse.
CREATE INDEX "lie_tenant_block_path_organ_status_idx" ON "latent_infection_event"("tenantId", "blockId", "pathogen", "hostOrgan", "status", "createdAt" DESC);
-- "What is due now" — partial, because only OPEN rows are ever asked.
CREATE INDEX "lie_open_symptom_due_idx" ON "latent_infection_event"("tenantId", "symptomExpectedAt") WHERE "status" = 'OPEN';
CREATE INDEX "lie_open_infectious_due_idx" ON "latent_infection_event"("tenantId", "infectiousExpectedAt") WHERE "status" = 'OPEN';
CREATE INDEX "lie_open_expiry_idx" ON "latent_infection_event"("tenantId", "expiresOn") WHERE "status" = 'OPEN';

-- ─────────────────────────────── 3) Foreign keys ───────────────────────────────
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "latent_infection_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "latent_infection_event_block_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Self-FKs are NO ACTION, not SET NULL: SET NULL would fire the immutability trigger mid-purge
-- (the lesson of 20260727020000_spray_self_fk_no_action).
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "latent_infection_event_supersedes_fkey" FOREIGN KEY ("tenantId", "supersedesRowId") REFERENCES "latent_infection_event"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "latent_infection_event_reverses_fkey" FOREIGN KEY ("tenantId", "reversesRowId") REFERENCES "latent_infection_event"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ─────────────────────────────── 4) CHECK constraints ───────────────────────────────
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_seq_positive" CHECK ("seq" >= 1);

-- C7: a date is present EXACTLY WHEN its kind says PROJECTED. This is what stops a bare NULL from
-- being asked to mean four different things.
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_symptom_projection_honest"
  CHECK (("symptomProjectionKind" = 'PROJECTED') = ("symptomExpectedAt" IS NOT NULL));
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_infectious_projection_honest"
  CHECK (("infectiousProjectionKind" = 'PROJECTED') = ("infectiousExpectedAt" IS NOT NULL));

-- The FIXED_WINDOW arm carries its bounds; the other arms must not pretend to have them.
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_fixed_window_bounds"
  CHECK (
    ("resolutionKind" = 'FIXED_WINDOW' AND "latentShortDays" IS NOT NULL AND "latentLongDays" IS NOT NULL AND "expiresOn" IS NOT NULL)
    OR ("resolutionKind" <> 'FIXED_WINDOW' AND "latentShortDays" IS NULL AND "latentLongDays" IS NULL)
  );
-- KD-4's asymmetry only makes sense if the interval is well-ordered.
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_latent_bounds_ordered"
  CHECK ("latentShortDays" IS NULL OR "latentLongDays" IS NULL OR "latentShortDays" <= "latentLongDays");
-- The UNKNOWN arm must never report a resolution date — that is the whole point of the arm.
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_unknown_arm_projects_nothing"
  CHECK ("resolutionKind" <> 'UNKNOWN' OR ("expiresOn" IS NULL AND "infectiousProjectionKind" <> 'PROJECTED'));
-- A closed row says when; an open row has not closed.
ALTER TABLE "latent_infection_event" ADD CONSTRAINT "lie_closed_has_date"
  CHECK (("status" = 'CLOSED') = ("resolvedOn" IS NOT NULL));

-- ─────────────────────────────── 5) RLS (Phase-12 / TENANT-1 template) ───────────────────────────────
ALTER TABLE "latent_infection_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "latent_infection_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "latent_infection_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- COUNCIL C5, AND THIS IS THE ACTUAL ENFORCEMENT: app_rls may SELECT and INSERT, never UPDATE or
-- DELETE. A trigger can be dropped or allowlisted by a later migration; a privilege the role does
-- not hold cannot be exercised at all. The triggers below are defence in depth.
--
-- THE REVOKE IS LOAD-BEARING AND IS NOT REDUNDANT WITH THE GRANT. The `..._app_rls_role` migration
-- set ALTER DEFAULT PRIVILEGES granting app_rls full DML on every table subsequently created in
-- public (AGENTS.md step 8), so a new table arrives with UPDATE and DELETE ALREADY GRANTED. Adding
-- `GRANT SELECT, INSERT` on top of that changes nothing. This exact mistake was caught by the
-- self-verify block at the bottom of this file when the migration was first test-applied to a
-- disposable Neon branch — which is precisely the failure council C5 predicted: a table that LOOKS
-- append-only because the triggers are there, while the grants quietly allow the opposite.
-- Precedent for the REVOKE posture: calculation_log.
GRANT SELECT, INSERT ON "latent_infection_event" TO app_rls;
REVOKE UPDATE, DELETE, TRUNCATE ON "latent_infection_event" FROM app_rls;

-- ─────────────────────────────── 6) Append-only triggers (defence in depth) ───────────────────────────────
-- Reuses the spray family's generic guards (20260727010000_spray_record): the mutation guard takes
-- an allowlist of bookkeeping columns as trigger args, and here it gets NONE — no column on this
-- table is ever updated. The delete guard is two-factor: the sanctioned purge GUC must be on AND the
-- connected role must not be app_rls (the flag alone is settable by the app role, council C15).
CREATE TRIGGER latent_infection_event_no_update BEFORE UPDATE ON "latent_infection_event"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation();
CREATE TRIGGER latent_infection_event_no_delete BEFORE DELETE ON "latent_infection_event"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

-- ─────────────────────────────── 7) Self-verify: RLS + policy + triggers + GRANTS ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'latent_infection_event' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on latent_infection_event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'latent_infection_event' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on latent_infection_event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE c.relname = 'latent_infection_event' AND g.tgname = 'latent_infection_event_no_update') THEN
    RAISE EXCEPTION 'append-only UPDATE trigger missing on latent_infection_event';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE c.relname = 'latent_infection_event' AND g.tgname = 'latent_infection_event_no_delete') THEN
    RAISE EXCEPTION 'append-only DELETE trigger missing on latent_infection_event';
  END IF;
  -- The grant posture IS the append-only guarantee (C5) — fail the migration if it ever drifts.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'latent_infection_event'
      AND grantee = 'app_rls' AND privilege_type IN ('UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'app_rls must NOT hold UPDATE/DELETE on latent_infection_event (append-only, council C5)';
  END IF;
END
$$;
