-- Phase 2 (Bond + tax-class) — schema + RLS + grants in ONE migration (council C2: splitting
-- table-creation from RLS-enable opens a live window where the NOBYPASSRLS app_rls role could touch a
-- new table before FORCE RLS — a tenant-isolation gap). Two new tenant-scoped tables (bond,
-- change_of_tax_class_event) to the AGENTS.md Phase-12 checklist, plus line-level bond columns on
-- lot_operation_line and bondId/filerSnapshot on compliance_report. Composite (tenantId, refId) ->
-- (tenantId, id) FKs are RAW SQL (K11 / Phase-1 Surprise 1) — no Prisma @relation. bond.ownerId is a
-- plain nullable column for now (AP-owner modeling is deferred with CHANGE_OWNERSHIP / OQ-1) — no FK.
-- The data BACKFILL (primary bond per tenant + compliance_report.bondId) is the sibling
-- _bond_taxclass_backfill migration (data-only, owner/BYPASSRLS, idempotent). The enum ADD VALUEs are
-- the earlier _bond_taxclass_enums migration (Windows enum rule).
--
-- ROLLBACK (Prisma has no down-migrations):
--   ALTER TABLE "compliance_report" DROP COLUMN "bondId", DROP COLUMN "filerSnapshot";
--   ALTER TABLE "lot_operation_line" DROP COLUMN "sourceBondId", DROP COLUMN "destBondId";
--   DROP TABLE "change_of_tax_class_event", "bond" CASCADE;

SET lock_timeout = '5s';

-- ─────────────── New columns on existing ledger/compliance tables ───────────────
ALTER TABLE "compliance_report" ADD COLUMN "bondId" TEXT,
  ADD COLUMN "filerSnapshot" JSONB;

ALTER TABLE "lot_operation_line" ADD COLUMN "destBondId" TEXT,
  ADD COLUMN "sourceBondId" TEXT;

-- ─────────────── bond (TTB bond registry — tenant-editable self-serve, ux-principle 9) ───────────────
CREATE TABLE "bond" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "registryNumber" TEXT NOT NULL,
    "penalSum" DECIMAL(12,2),
    "premises" TEXT,
    "ownerId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bond_pkey" PRIMARY KEY ("id")
);

-- ─────────────── change_of_tax_class_event (dated, append-only; carries volumeAtEvent, no ledger line) ───────────────
CREATE TABLE "change_of_tax_class_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "fromClass" TEXT,
    "toClass" TEXT NOT NULL,
    "volumeAtEvent" DECIMAL(10,2),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "reason" TEXT,
    "commandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_of_tax_class_event_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Indexes (Prisma-named; from `migrate diff`) ───────────────
CREATE INDEX "bond_tenantId_idx" ON "bond"("tenantId");
CREATE INDEX "bond_tenantId_isPrimary_idx" ON "bond"("tenantId", "isPrimary");
CREATE UNIQUE INDEX "bond_tenantId_registryNumber_key" ON "bond"("tenantId", "registryNumber");
CREATE UNIQUE INDEX "bond_tenantId_id_key" ON "bond"("tenantId", "id");

CREATE INDEX "change_of_tax_class_event_tenantId_lotId_observedAt_idx" ON "change_of_tax_class_event"("tenantId", "lotId", "observedAt");
CREATE UNIQUE INDEX "change_of_tax_class_event_tenantId_commandId_key" ON "change_of_tax_class_event"("tenantId", "commandId");
CREATE UNIQUE INDEX "change_of_tax_class_event_tenantId_id_key" ON "change_of_tax_class_event"("tenantId", "id");

CREATE INDEX "compliance_report_tenantId_formType_bondId_status_periodEnd_idx" ON "compliance_report"("tenantId", "formType", "bondId", "status", "periodEnd", "generatedAt");
CREATE INDEX "lot_operation_line_tenantId_destBondId_idx" ON "lot_operation_line"("tenantId", "destBondId");

-- ─────────────── Promote (tenantId, id) unique INDEXES to CONSTRAINTS (composite-FK targets) ───────────────
-- Postgres requires an FK to reference a UNIQUE CONSTRAINT/PK, not a bare unique index (Phase-1 pattern).
ALTER TABLE "bond" ADD CONSTRAINT "bond_tenantId_id_key" UNIQUE USING INDEX "bond_tenantId_id_key";

-- ─────────────── FKs: tenantId -> organization (Phase-12 checklist, ON DELETE RESTRICT) ───────────────
ALTER TABLE "bond" ADD CONSTRAINT "bond_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "change_of_tax_class_event" ADD CONSTRAINT "change_of_tax_class_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs (K11; MATCH SIMPLE — a NULL bond column skips the check) ───────────────
-- Line-level bond (BOND-1): nullable on legacy/origination lines (derives to primary); a bond-moving op
-- stamps an explicit bond in the core. RESTRICT so a referenced bond can't be deleted out from under history.
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_tenantId_sourceBondId_fkey" FOREIGN KEY ("tenantId", "sourceBondId") REFERENCES "bond"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "lot_operation_line" ADD CONSTRAINT "lot_operation_line_tenantId_destBondId_fkey" FOREIGN KEY ("tenantId", "destBondId") REFERENCES "bond"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
-- Per-bond report scoping: nullable until the backfill sets it (all existing rows NULL here → valid).
ALTER TABLE "compliance_report" ADD CONSTRAINT "compliance_report_tenantId_bondId_fkey" FOREIGN KEY ("tenantId", "bondId") REFERENCES "bond"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
-- Event -> lot (lot's (tenantId, id) composite unique already exists from Phase 12).
ALTER TABLE "change_of_tax_class_event" ADD CONSTRAINT "change_of_tax_class_event_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── RLS (ENABLE + FORCE + tenant_isolation; fail-closed on unset GUC) ───────────────
ALTER TABLE "bond" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bond" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bond" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "change_of_tax_class_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "change_of_tax_class_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "change_of_tax_class_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ─────────────── app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "bond" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "change_of_tax_class_event" TO app_rls;

-- Fail-closed guard: every new table must have RLS ENABLE+FORCE + a tenant_isolation policy.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['bond', 'change_of_tax_class_event'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', r;
    END IF;
  END LOOP;
END
$$;
