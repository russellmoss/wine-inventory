-- Phase 15 Unit 2 — accounting integration schema. Five new tenant-scoped tables built to the
-- AGENTS.md Phase-12 checklist (tenantId + @@index, composite tenant FK -> organization ON DELETE
-- RESTRICT, per-tenant uniques, and — in the sibling _accounting_rls migration — RLS ENABLE+FORCE +
-- a tenant_isolation policy + app_rls grant). Plus: security-critical DB invariants (SEC-S5 tokens-
-- only-when-connected, SEC-C2 one-realm-per-provider), the delivery source XOR + scale partial index,
-- and the least-privilege cron ENUMERATOR role (SEC-C3) that must never touch a token table.

SET lock_timeout = '5s';

-- ─────────────── accounting_connection (per-tenant OAuth company link + encrypted refresh token) ───────────────
CREATE TABLE "accounting_connection" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "environment" TEXT NOT NULL,
    "externalRealmId" TEXT,
    "refreshTokenCt" TEXT,
    "dekWrapped" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "homeCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_connection_pkey" PRIMARY KEY ("id")
);

-- ─────────────── oauth_state (short-lived, single-use PKCE + nonce store — SEC-C1) ───────────────
CREATE TABLE "oauth_state" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "pkceVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_state_pkey" PRIMARY KEY ("id")
);

-- ─────────────── vendor (minimal AP vendor; QBO Vendor.Id cache; PII lives here, never in events) ───────────────
CREATE TABLE "vendor" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "terms" TEXT,
    "externalVendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- ─────────────── ap_export_event (immutable AP seam, mirrors cost_export_event) ───────────────
CREATE TABLE "ap_export_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "postingKey" TEXT NOT NULL,
    "supplyLotId" TEXT,
    "vendorId" TEXT,
    "amount" DECIMAL(18,8) NOT NULL,
    "debitAccount" TEXT,
    "creditAccount" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "reversalOfApExportEventId" TEXT,
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'KNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ap_export_event_pkey" PRIMARY KEY ("id")
);

-- ─────────────── accounting_delivery (MUTABLE state machine over the immutable export seam) ───────────────
CREATE TABLE "accounting_delivery" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "costExportEventId" TEXT,
    "apExportEventId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "objectType" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "externalId" TEXT,
    "postingDate" TIMESTAMP(3),
    "withheldReason" TEXT,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_delivery_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Indexes / uniques ───────────────
CREATE UNIQUE INDEX "accounting_connection_tenantId_provider_key" ON "accounting_connection"("tenantId", "provider");
CREATE UNIQUE INDEX "accounting_connection_tenantId_id_key" ON "accounting_connection"("tenantId", "id");
CREATE INDEX "accounting_connection_tenantId_idx" ON "accounting_connection"("tenantId");

CREATE UNIQUE INDEX "oauth_state_tenantId_nonceHash_key" ON "oauth_state"("tenantId", "nonceHash");
CREATE INDEX "oauth_state_tenantId_idx" ON "oauth_state"("tenantId");
CREATE INDEX "oauth_state_expiresAt_idx" ON "oauth_state"("expiresAt");

CREATE UNIQUE INDEX "vendor_tenantId_name_key" ON "vendor"("tenantId", "name");
CREATE UNIQUE INDEX "vendor_tenantId_id_key" ON "vendor"("tenantId", "id");
CREATE INDEX "vendor_tenantId_idx" ON "vendor"("tenantId");

CREATE UNIQUE INDEX "ap_export_event_tenantId_postingKey_key" ON "ap_export_event"("tenantId", "postingKey");
CREATE UNIQUE INDEX "ap_export_event_tenantId_id_key" ON "ap_export_event"("tenantId", "id");
CREATE INDEX "ap_export_event_tenantId_idx" ON "ap_export_event"("tenantId");
CREATE INDEX "ap_export_event_tenantId_supplyLotId_idx" ON "ap_export_event"("tenantId", "supplyLotId");

CREATE UNIQUE INDEX "accounting_delivery_tenantId_costExportEventId_key" ON "accounting_delivery"("tenantId", "costExportEventId");
CREATE UNIQUE INDEX "accounting_delivery_tenantId_apExportEventId_key" ON "accounting_delivery"("tenantId", "apExportEventId");
CREATE INDEX "accounting_delivery_tenantId_idx" ON "accounting_delivery"("tenantId");
CREATE INDEX "accounting_delivery_tenantId_connectionId_idx" ON "accounting_delivery"("tenantId", "connectionId");

-- cost_export_event gains a (tenantId, id) composite-FK target for accounting_delivery (K11).
CREATE UNIQUE INDEX "cost_export_event_tenantId_id_key" ON "cost_export_event"("tenantId", "id");

-- ─────────────── account_mapping: single-default enforcement via sentinel '*' (council C7) ───────────────
-- NULL taxClass could not be uniquely enforced (Postgres NULLs are distinct), so two "defaults" per
-- component were possible. Standardize the default on '*' (matches the seam's accountKey), then make
-- the column NOT NULL so the existing (tenantId, component, taxClass) unique enforces one default.
UPDATE "account_mapping" SET "taxClass" = '*' WHERE "taxClass" IS NULL;
ALTER TABLE "account_mapping" ALTER COLUMN "taxClass" SET DEFAULT '*';
ALTER TABLE "account_mapping" ALTER COLUMN "taxClass" SET NOT NULL;

-- ─────────────── Promote (tenantId, id) unique INDEXES to CONSTRAINTS (Postgres FKs need a unique
-- constraint, not a bare index; names preserved -> no Prisma drift) ───────────────
ALTER TABLE "accounting_connection" ADD CONSTRAINT "accounting_connection_tenantId_id_key" UNIQUE USING INDEX "accounting_connection_tenantId_id_key";
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_tenantId_id_key" UNIQUE USING INDEX "vendor_tenantId_id_key";
ALTER TABLE "ap_export_event" ADD CONSTRAINT "ap_export_event_tenantId_id_key" UNIQUE USING INDEX "ap_export_event_tenantId_id_key";
ALTER TABLE "cost_export_event" ADD CONSTRAINT "cost_export_event_tenantId_id_key" UNIQUE USING INDEX "cost_export_event_tenantId_id_key";

-- ─────────────── FKs: tenantId -> organization (Phase-12 checklist, ON DELETE RESTRICT) ───────────────
ALTER TABLE "accounting_connection" ADD CONSTRAINT "accounting_connection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ap_export_event" ADD CONSTRAINT "ap_export_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs (K11 — cross-tenant references structurally impossible) ───────────────
ALTER TABLE "ap_export_event" ADD CONSTRAINT "ap_export_event_tenantId_vendorId_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "accounting_connection"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_tenantId_costExportEventId_fkey" FOREIGN KEY ("tenantId", "costExportEventId") REFERENCES "cost_export_event"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_tenantId_apExportEventId_fkey" FOREIGN KEY ("tenantId", "apExportEventId") REFERENCES "ap_export_event"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── Security-critical DB invariants ───────────────
-- SEC-S5: a non-CONNECTED connection holds NO token material (disconnect zeroizes ciphertext).
ALTER TABLE "accounting_connection" ADD CONSTRAINT "accounting_connection_tokens_only_when_connected"
  CHECK ("status" = 'CONNECTED' OR ("refreshTokenCt" IS NULL AND "dekWrapped" IS NULL));

-- A delivery sources from EXACTLY ONE export event (cost XOR ap) — the one-poster/one-state-machine
-- invariant (A2). '<>' on the two IS-NOT-NULL booleans is XOR.
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_one_source"
  CHECK (("costExportEventId" IS NOT NULL) <> ("apExportEventId" IS NOT NULL));

-- SEC-C2: one ACTIVE company (realmId) attaches to at most one tenant per provider. Cross-tenant
-- (no tenantId in the key) and partial (only CONNECTED rows), so disconnect frees the realm.
CREATE UNIQUE INDEX "accounting_connection_active_realm_key"
  ON "accounting_connection" ("provider", "externalRealmId")
  WHERE "status" = 'CONNECTED' AND "externalRealmId" IS NOT NULL;

-- Scale: the poster/refresh sweeps only ever scan the OPEN work; a partial index keeps that a
-- bounded seek, not a table scan, as POSTED history grows (scale-register tripwire).
CREATE INDEX "accounting_delivery_active_idx" ON "accounting_delivery" ("tenantId", "status")
  WHERE "status" IN ('PENDING', 'VERIFYING', 'FAILED');

-- ─────────────── app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounting_connection" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "oauth_state" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vendor" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ap_export_event" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "accounting_delivery" TO app_rls;

-- ─────────────── Least-privilege cron ENUMERATOR role (SEC-C3) ───────────────
-- A dedicated NON-OWNER role for the accounting cron. It lists org IDs to sweep and DELIBERATELY has
-- NO grant on any token table (accounting_connection / oauth_state / ap_export_event /
-- accounting_delivery), so a system/cron path cannot read a secret even by mistake. The actual
-- token reads happen per-tenant under app_rls (runAsTenant), never as this role. The BYPASSRLS owner
-- stays migrations-only. Password is set out-of-band by a credential script (never committed), like
-- app_rls — until then the role exists but cannot authenticate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'accounting_enumerator') THEN
    CREATE ROLE accounting_enumerator WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  ELSE
    ALTER ROLE accounting_enumerator WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO accounting_enumerator;
-- ONLY the org-id source — NOTHING else. No ALTER DEFAULT PRIVILEGES, so future token tables never
-- auto-grant to this role.
GRANT SELECT ON "organization" TO accounting_enumerator;
