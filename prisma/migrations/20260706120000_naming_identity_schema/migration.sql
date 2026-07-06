-- Phase 1 (identity presentation) — schema + RLS + grants in ONE migration (council C2: splitting
-- table-creation from RLS-enable opens a live window where the NOBYPASSRLS app_rls role could touch a
-- new table before FORCE RLS, a tenant-isolation gap). Four new tenant-scoped tables to the AGENTS.md
-- Phase-12 checklist + Lot.displayName. Composite (tenantId, refId)->(tenantId, id) FKs (K11). Partial
-- uniques (null-safe re-import key, single current-code, single default) are raw SQL — Prisma can't
-- express them. `field` is CHECK-constrained. The data BACKFILL is the sibling _naming_identity_backfill
-- migration (data-only, owner/BYPASSRLS, idempotent).
--
-- ROLLBACK (Prisma has no down-migrations):
--   DROP TABLE "lot_code_event","lot_identifier","naming_template_version","naming_template" CASCADE;
--   ALTER TABLE "lot" DROP COLUMN "displayName";

SET lock_timeout = '5s';

-- ─────────────── Lot.displayName (mutable, NON-unique; NULL default, coalesced in the app) ───────────────
ALTER TABLE "lot" ADD COLUMN "displayName" TEXT;

-- ─────────────── lot_identifier (external/source ids + current-code convenience + search index) ───────────────
CREATE TABLE "lot_identifier" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "sourceObjectType" TEXT,
    "value" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lot_identifier_pkey" PRIMARY KEY ("id")
);

-- ─────────────── lot_code_event (append-only rename history — source of truth, NAMING-2) ───────────────
CREATE TABLE "lot_code_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_code_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lot_code_event_field_check" CHECK ("field" IN ('code', 'displayName'))
);

-- ─────────────── naming_template (versioned, clone-on-customize; WO-template parity) ───────────────
CREATE TABLE "naming_template" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "clonedFromId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "naming_template_pkey" PRIMARY KEY ("id")
);

-- ─────────────── naming_template_version (immutable spec snapshot) ───────────────
CREATE TABLE "naming_template_version" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByEmail" TEXT,

    CONSTRAINT "naming_template_version_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Per-tenant uniques + (tenantId, id) targets + regular indexes ───────────────
CREATE UNIQUE INDEX "lot_identifier_tenantId_id_key" ON "lot_identifier"("tenantId", "id");
CREATE INDEX "lot_identifier_tenantId_idx" ON "lot_identifier"("tenantId");
CREATE INDEX "lot_identifier_tenantId_lotId_idx" ON "lot_identifier"("tenantId", "lotId");
CREATE INDEX "lot_identifier_tenantId_value_idx" ON "lot_identifier"("tenantId", "value");

CREATE UNIQUE INDEX "lot_code_event_tenantId_id_key" ON "lot_code_event"("tenantId", "id");
CREATE UNIQUE INDEX "lot_code_event_tenantId_commandId_key" ON "lot_code_event"("tenantId", "commandId");
CREATE INDEX "lot_code_event_tenantId_lotId_idx" ON "lot_code_event"("tenantId", "lotId");
CREATE INDEX "lot_code_event_tenantId_toValue_idx" ON "lot_code_event"("tenantId", "toValue");
CREATE INDEX "lot_code_event_tenantId_fromValue_idx" ON "lot_code_event"("tenantId", "fromValue");

CREATE UNIQUE INDEX "naming_template_tenantId_code_key" ON "naming_template"("tenantId", "code");
CREATE UNIQUE INDEX "naming_template_tenantId_id_key" ON "naming_template"("tenantId", "id");
CREATE INDEX "naming_template_tenantId_idx" ON "naming_template"("tenantId");

CREATE UNIQUE INDEX "naming_template_version_tenantId_templateId_version_key" ON "naming_template_version"("tenantId", "templateId", "version");
CREATE UNIQUE INDEX "naming_template_version_tenantId_id_key" ON "naming_template_version"("tenantId", "id");
CREATE INDEX "naming_template_version_tenantId_idx" ON "naming_template_version"("tenantId");

-- ─────────────── Partial uniques (raw SQL — Prisma cannot express these) ───────────────
-- Null-safe re-import idempotency key (council C1: a Prisma @@unique with a nullable column does NOT
-- dedupe, Postgres treats NULLs as distinct). Two partials cover both cases; COALESCE folds a nullable
-- sourceObjectType so a same-(system,value) row with null objectType still dedupes.
CREATE UNIQUE INDEX "lot_identifier_native_value_key" ON "lot_identifier"("tenantId", "value") WHERE "sourceSystem" IS NULL;
CREATE UNIQUE INDEX "lot_identifier_source_value_key" ON "lot_identifier"("tenantId", "sourceSystem", (COALESCE("sourceObjectType", '')), "value") WHERE "sourceSystem" IS NOT NULL;
-- Exactly one current-code row per lot (council C4: was app-maintained; now a DB partial unique).
CREATE UNIQUE INDEX "lot_identifier_one_current_code_key" ON "lot_identifier"("tenantId", "lotId") WHERE "kind" = 'current-code';
-- Exactly one active default naming template per tenant (council/eng E6).
CREATE UNIQUE INDEX "naming_template_one_default_key" ON "naming_template"("tenantId") WHERE "isDefault" AND "archivedAt" IS NULL;

-- ─────────────── Promote (tenantId, id) unique INDEXES to CONSTRAINTS (composite-FK targets) ───────────────
ALTER TABLE "naming_template" ADD CONSTRAINT "naming_template_tenantId_id_key" UNIQUE USING INDEX "naming_template_tenantId_id_key";

-- ─────────────── FKs: tenantId -> organization (Phase-12 checklist, ON DELETE RESTRICT) ───────────────
ALTER TABLE "lot_identifier" ADD CONSTRAINT "lot_identifier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lot_code_event" ADD CONSTRAINT "lot_code_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "naming_template" ADD CONSTRAINT "naming_template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "naming_template_version" ADD CONSTRAINT "naming_template_version_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs (K11; names match the Prisma composite relations -> no drift) ───────────────
ALTER TABLE "lot_identifier" ADD CONSTRAINT "lot_identifier_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "lot_code_event" ADD CONSTRAINT "lot_code_event_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "naming_template_version" ADD CONSTRAINT "naming_template_version_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "naming_template"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;

-- ─────────────── RLS (ENABLE + FORCE + tenant_isolation; fail-closed on unset GUC) ───────────────
ALTER TABLE "lot_identifier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_identifier" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_identifier" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_code_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_code_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_code_event" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "naming_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "naming_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "naming_template" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "naming_template_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "naming_template_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "naming_template_version" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ─────────────── app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "lot_identifier" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lot_code_event" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "naming_template" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "naming_template_version" TO app_rls;

-- Fail-closed guard: every new table must have RLS ENABLE+FORCE + a tenant_isolation policy.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['lot_identifier', 'lot_code_event', 'naming_template', 'naming_template_version'] LOOP
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
