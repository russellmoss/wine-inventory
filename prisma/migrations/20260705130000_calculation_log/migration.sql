-- Plan 040 PR2 Unit 11: the winemaking-calculator traceability table.
--
-- Built to the Phase-12 multi-tenancy checklist (mirrors 20260701020200_compliance_schema +
-- 20260701020300_compliance_rls): tenantId NOT NULL from creation (new table → no nullable→backfill
-- →set-not-null dance), FK → organization ON DELETE RESTRICT, RLS ENABLE+FORCE + a tenant_isolation
-- policy (USING and WITH CHECK on app.tenant_id, fail-closed). CalculationSource is a NEW enum →
-- created here in the same migration (the Windows "enum-first split" rule is ONLY for ALTER TYPE …
-- ADD VALUE on an EXISTING enum, not a fresh CREATE TYPE).
--
-- DB-ENFORCED APPEND-ONLY (LOCKED #10): app_rls is granted only SELECT + INSERT; UPDATE + DELETE are
-- REVOKEd (the ALTER DEFAULT PRIVILEGES from 20260701000900_app_rls_role auto-granted all four, so the
-- REVOKE is what actually makes the audit tamper-resistant). No edit/delete code path exists either.

-- CreateEnum
CREATE TYPE "CalculationSource" AS ENUM ('PAGE', 'ASSISTANT');

-- CreateTable
CREATE TABLE "calculation_log" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "calculatorId" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "unitsUsed" JSONB NOT NULL,
    "source" "CalculationSource" NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "advisory" BOOLEAN NOT NULL DEFAULT false,
    "danger" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calculation_log_tenantId_createdAt_idx" ON "calculation_log"("tenantId", "createdAt");
CREATE INDEX "calculation_log_tenantId_userId_createdAt_idx" ON "calculation_log"("tenantId", "userId", "createdAt");
CREATE INDEX "calculation_log_tenantId_calculatorId_createdAt_idx" ON "calculation_log"("tenantId", "calculatorId", "createdAt");

-- AddForeignKey (Phase-12 checklist item 2/5): tenantId → organization(id), ON DELETE RESTRICT.
ALTER TABLE "calculation_log" ADD CONSTRAINT "calculation_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (checklist item 6): ENABLE + FORCE + tenant_isolation. FAIL-CLOSED — with no app.tenant_id set,
-- current_setting(...) is NULL, ("tenantId" = NULL) is NULL (never true) → zero rows / rejected insert.
ALTER TABLE "calculation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calculation_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "calculation_log" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- app_rls grants (checklist item 8) + DB-enforced append-only (LOCKED #10). Grant only SELECT + INSERT,
-- then REVOKE the UPDATE/DELETE that ALTER DEFAULT PRIVILEGES already auto-granted at table creation.
GRANT SELECT, INSERT ON "calculation_log" TO app_rls;
REVOKE UPDATE, DELETE ON "calculation_log" FROM app_rls;

-- Fail this migration if RLS isn't fully on, or if app_rls somehow still holds UPDATE/DELETE (either
-- would defeat the isolation / append-only guarantees this table exists to make).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'calculation_log' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on calculation_log';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculation_log' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on calculation_log';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'calculation_log' AND grantee = 'app_rls' AND privilege_type IN ('UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'append-only violated: app_rls still holds UPDATE/DELETE on calculation_log';
  END IF;
END
$$;
