-- Phase 12 Unit 6: dedicated NON-OWNER, NOBYPASSRLS, non-superuser app role. RLS is a no-op
-- unless the app connects as a role WITHOUT BYPASSRLS (Neon's neondb_owner carries BYPASSRLS).
-- Migrations keep running as the owner (unpooled); only the runtime pooled DATABASE_URL is later
-- repointed at app_rls (the deferred "activation" step, done with the operator + Vercel).
--
-- This migration creates the role and grants (idempotent, secret-free). The role's PASSWORD is set
-- out-of-band by scripts/setup-app-rls-credential.ts (a runtime-generated secret, never committed),
-- so no credential ever lands in git or the migration history.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rls') THEN
    -- LOGIN but no password yet -> cannot authenticate until the credential script runs.
    CREATE ROLE app_rls WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  ELSE
    ALTER ROLE app_rls WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

-- Schema + DML (NO TRUNCATE — TRUNCATE bypasses RLS; NO DDL/ownership). Covers the global
-- auth/org tables too (Better Auth queries them as the app connection during login).
GRANT USAGE ON SCHEMA public TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls;

-- Future tables/sequences created by the owner (later migrations) auto-grant to app_rls.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rls;
