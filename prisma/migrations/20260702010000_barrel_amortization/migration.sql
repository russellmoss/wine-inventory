-- Phase 8b Unit 8 (D7): barrel-as-depreciating-asset. Two new tenant-scoped tables (Phase-12
-- checklist): barrel_asset (1:1 with a BARREL vessel — purchase cost + accelerated fill-based
-- amortization) and barrel_fill (each lot's residency interval in a barrel). No new enum. Money is
-- DECIMAL(18,8); volumes DECIMAL(10,2). Composite tenant FKs (K11) target the (tenantId,id) uniques on
-- vessel / lot / lot_operation / barrel_asset. RLS + grants + the fail-closed DO-block are inline.
-- NOT deployed until the operator runs `prisma migrate deploy`.

SET lock_timeout = '5s';

-- ─────────────── barrel_asset (per-barrel depreciating asset) ───────────────
CREATE TABLE "barrel_asset" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "purchaseCost" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "usefulLifeFills" INTEGER NOT NULL DEFAULT 4,
    "currentFillNumber" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barrel_asset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "barrel_asset_vesselId_key" UNIQUE ("vesselId"),
    CONSTRAINT "barrel_asset_tenantId_id_key" UNIQUE ("tenantId", "id"),
    CONSTRAINT "barrel_asset_cost_nonneg_chk" CHECK ("purchaseCost" >= 0 AND "usefulLifeFills" > 0)
);

-- ─────────────── barrel_fill (one lot's residency interval in a barrel) ───────────────
CREATE TABLE "barrel_fill" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "barrelAssetId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "fillNumber" INTEGER NOT NULL,
    "volumeL" DECIMAL(10,2) NOT NULL,
    "capacityL" DECIMAL(10,2) NOT NULL,
    "purchaseCostSnapshot" DECIMAL(18,8) NOT NULL,
    "fillDepreciation" DECIMAL(18,8) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "openOpId" INTEGER NOT NULL,
    "closeOpId" INTEGER,
    "materializedCostLineId" TEXT,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barrel_fill_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Indexes ───────────────
CREATE INDEX "barrel_asset_tenantId_idx" ON "barrel_asset"("tenantId");
CREATE INDEX "barrel_fill_tenantId_idx" ON "barrel_fill"("tenantId");
CREATE INDEX "barrel_fill_tenantId_lotId_idx" ON "barrel_fill"("tenantId", "lotId");
-- Open-fill scan for the accrue-to-date read + close lookup.
CREATE INDEX "barrel_fill_tenantId_barrelAssetId_endedAt_idx" ON "barrel_fill"("tenantId", "barrelAssetId", "endedAt");

-- ─────────────── Foreign keys: tenantId → organization (Phase-12 checklist item 2) ───────────────
ALTER TABLE "barrel_asset" ADD CONSTRAINT "barrel_asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "barrel_fill" ADD CONSTRAINT "barrel_fill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs (K11): (tenantId, refId) → parent(tenantId, id) ───────────────
-- barrel_asset → vessel (CASCADE: the asset dies with its barrel)
ALTER TABLE "barrel_asset" ADD CONSTRAINT "barrel_asset_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
-- barrel_fill → barrel_asset (CASCADE), → lot (RESTRICT), → lot_operation x1 (RESTRICT; closeOpId is a soft ref)
ALTER TABLE "barrel_fill" ADD CONSTRAINT "barrel_fill_tenantId_barrelAssetId_fkey" FOREIGN KEY ("tenantId", "barrelAssetId") REFERENCES "barrel_asset"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "barrel_fill" ADD CONSTRAINT "barrel_fill_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "barrel_fill" ADD CONSTRAINT "barrel_fill_tenantId_openOpId_fkey" FOREIGN KEY ("tenantId", "openOpId") REFERENCES "lot_operation"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── RLS (Phase-12 pattern: ENABLE + FORCE + fail-closed tenant_isolation) ───────────────
ALTER TABLE "barrel_asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "barrel_asset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "barrel_asset" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "barrel_fill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "barrel_fill" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "barrel_fill" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants owner-created tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON "barrel_asset" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "barrel_fill" TO app_rls;

-- Fail this migration if either table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['barrel_asset', 'barrel_fill'] LOOP
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
