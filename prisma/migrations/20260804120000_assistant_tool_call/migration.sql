-- Plan 107 Unit 1a — `assistant_tool_call`: one APPEND-ONLY row per tool dispatch, written BEFORE
-- the tool runs, so tool usage survives a timeout, a swallowed write, and the 40-call trace cap.
--
-- HAND-AUTHORED. `prisma migrate diff` is not used in this repo (it drops tenant FKs on this box).
-- Built to the full Phase-12 tenant checklist (AGENTS.md); SQL posture copied from
-- `20260728100100_latent_infection_event`, append-only posture from `20260705130000_calculation_log`.
--
-- NOTE ON STEP 3 OF THE CHECKLIST (backfill-then-enforce): vacuous here. This is a brand-new table
-- with no existing rows, so `tenantId` can be NOT NULL from creation. That is the ONE easy case of
-- the live-tenant rule — do not generalise it to a column added to a populated table.

-- ─────────────────────────────── 1) Table ───────────────────────────────
CREATE TABLE "assistant_tool_call" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolKind" TEXT NOT NULL,
    "modelTurn" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_tool_call_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────── 2) Indexes ───────────────────────────────
-- Both are (tenantId, …) leading: every read is tenant-scoped by RLS, so a tenant-leading index is
-- the only shape the planner can actually use. The report groups by toolName over a date range.
CREATE INDEX "assistant_tool_call_tenantId_createdAt_idx" ON "assistant_tool_call"("tenantId", "createdAt");
CREATE INDEX "assistant_tool_call_tenantId_toolName_createdAt_idx" ON "assistant_tool_call"("tenantId", "toolName", "createdAt");

-- ─────────────────────────────── 3) Tenant FK ───────────────────────────────
-- ON DELETE RESTRICT: usage history must not vanish because an organization row was removed.
-- `conversationId` is deliberately NOT an FK — an FK would let a logging write break a chat turn,
-- and its cascade would silently rewrite usage history when a conversation is deleted.
ALTER TABLE "assistant_tool_call"
  ADD CONSTRAINT "assistant_tool_call_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────── 4) RLS (TENANT-1) ───────────────────────────────
-- ENABLE + FORCE, and a policy with USING *and* WITH CHECK so an unset GUC fails closed in BOTH
-- directions (a missing app.tenant_id must not read another tenant's rows, and must not write ours).
ALTER TABLE "assistant_tool_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_tool_call" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assistant_tool_call" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ─────────────────────────────── 5) Grants: THIS is the append-only guarantee ───────────────────────────────
-- THE REVOKE IS LOAD-BEARING AND IS NOT REDUNDANT WITH THE GRANT. The `..._app_rls_role` migration
-- set ALTER DEFAULT PRIVILEGES granting app_rls full DML on every table subsequently created in
-- public (AGENTS.md step 8), so this table arrives with UPDATE and DELETE ALREADY GRANTED and a bare
-- `GRANT SELECT, INSERT` changes nothing. A privilege the role does not hold cannot be exercised;
-- a trigger can be dropped by a later migration. Precedent: calculation_log, latent_infection_event.
GRANT SELECT, INSERT ON "assistant_tool_call" TO app_rls;
REVOKE UPDATE, DELETE, TRUNCATE ON "assistant_tool_call" FROM app_rls;

-- ─────────────────────────────── 6) Append-only triggers (defence in depth) ───────────────────────────────
-- Reuses the spray family's generic guards (20260727010000_spray_record). The mutation guard takes an
-- allowlist of bookkeeping columns as trigger args and gets NONE here: no column on this table is
-- ever updated. The delete guard is two-factor (sanctioned-purge GUC AND a non-app_rls role), so the
-- app role cannot self-authorise a delete by setting the flag.
CREATE TRIGGER assistant_tool_call_no_update BEFORE UPDATE ON "assistant_tool_call"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_content_mutation();
CREATE TRIGGER assistant_tool_call_no_delete BEFORE DELETE ON "assistant_tool_call"
  FOR EACH ROW EXECUTE FUNCTION spray_reject_delete();

-- ─────────────────────────────── 7) Self-verify: RLS + policy + triggers + GRANTS ───────────────────────────────
-- This block is why the REVOKE above exists: on latent_infection_event the identical check caught a
-- table that LOOKED append-only (triggers present) while the default-privilege grants quietly allowed
-- UPDATE and DELETE. Fail the migration rather than ship that.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'assistant_tool_call' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on assistant_tool_call';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assistant_tool_call' AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on assistant_tool_call';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE c.relname = 'assistant_tool_call' AND g.tgname = 'assistant_tool_call_no_update') THEN
    RAISE EXCEPTION 'append-only UPDATE trigger missing on assistant_tool_call';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE c.relname = 'assistant_tool_call' AND g.tgname = 'assistant_tool_call_no_delete') THEN
    RAISE EXCEPTION 'append-only DELETE trigger missing on assistant_tool_call';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'assistant_tool_call'
      AND grantee = 'app_rls' AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'app_rls must NOT hold UPDATE/DELETE/TRUNCATE on assistant_tool_call (append-only)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'assistant_tool_call'
      AND grantee = 'app_rls' AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'app_rls must hold INSERT on assistant_tool_call (the logger writes as app_rls)';
  END IF;
END $$;
