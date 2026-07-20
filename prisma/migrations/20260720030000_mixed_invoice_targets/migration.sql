-- Plan 080 U5: a MIXED invoice — parts, equipment assets and finished goods on ONE document.
--
-- Three additions, each with a council ruling behind it:
--   C2  `targetKind` is NULLABLE with NO DEFAULT. A null target is a hard needsAck at apply, never a silent
--       MATERIAL assumption — guessing where goods land mis-posts real money.
--   S11 The finished-goods target is resolved at REVIEW time, not auto-created at apply (apply-time create
--       is irreversible), so the line carries the chosen wine_sku / finished_good id.
--   C5  An invoice line for 2 pumps creates TWO EquipmentAssets; a single FK cannot represent N, so the
--       line→assets link is its own append-only join table.
--   C3  A mixed invoice must code each line to its OWN GL account (fixed asset / expense / inventory), so
--       AppSettings gains the two accounts it lacked. NULLABLE on purpose — an unconfigured account
--       WITHHOLDS the invoice rather than silently coding a pump to Inventory Asset.
--
-- Hand-authored (Windows/Neon rule): `prisma migrate diff` is unusable here — the live DB carries hundreds
-- of raw-SQL composite tenant FKs + RLS policies the datamodel does not model.

-- ── 1. Per-line GL accounts (C3) ──────────────────────────────────────────────────────────────────────
ALTER TABLE "app_settings" ADD COLUMN "apFixedAssetAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "apSuppliesExpenseAccount" TEXT;

-- ── 2. The line's target discriminator + review-time resolved finished-goods target (C2, S11) ─────────
ALTER TABLE "ingested_invoice_line" ADD COLUMN "targetKind" TEXT;
ALTER TABLE "ingested_invoice_line" ADD COLUMN "wineSkuTargetId" TEXT;
ALTER TABLE "ingested_invoice_line" ADD COLUMN "finishedGoodTargetId" TEXT;

-- Vocabulary is CHECK-constrained (the house pattern: validated strings, not a new Prisma enum).
ALTER TABLE "ingested_invoice_line"
  ADD CONSTRAINT "ingested_invoice_line_targetkind_check"
  CHECK ("targetKind" IS NULL OR "targetKind" IN ('MATERIAL', 'EQUIPMENT_ASSET', 'FINISHED_GOOD'));

-- A finished-goods target is meaningful ONLY on a FINISHED_GOOD line, and names exactly one of the two
-- catalogs. Without this a line could carry a wine target while routing to MATERIAL and quietly diverge.
ALTER TABLE "ingested_invoice_line"
  ADD CONSTRAINT "ingested_invoice_line_fg_target_check"
  CHECK (
    ("wineSkuTargetId" IS NULL AND "finishedGoodTargetId" IS NULL)
    OR ("targetKind" = 'FINISHED_GOOD'
        AND (("wineSkuTargetId" IS NOT NULL)::int + ("finishedGoodTargetId" IS NOT NULL)::int = 1))
  );

CREATE INDEX "iil_tenant_target_idx" ON "ingested_invoice_line" ("tenantId", "targetKind");

ALTER TABLE "ingested_invoice_line"
  ADD CONSTRAINT "iil_tenant_winesku_target_fkey"
  FOREIGN KEY ("tenantId", "wineSkuTargetId") REFERENCES "wine_sku"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingested_invoice_line"
  ADD CONSTRAINT "iil_tenant_finishedgood_target_fkey"
  FOREIGN KEY ("tenantId", "finishedGoodTargetId") REFERENCES "finished_good"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. line → created assets (C5) ─────────────────────────────────────────────────────────────────────
CREATE TABLE "ingested_invoice_line_created_asset" (
  "tenantId"         TEXT         NOT NULL DEFAULT '',
  "id"               TEXT         NOT NULL,
  "lineId"           TEXT         NOT NULL,
  "equipmentAssetId" TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ingested_invoice_line_created_asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "iilca_tenantId_id_key" ON "ingested_invoice_line_created_asset" ("tenantId", "id");
-- One row per (line, asset): re-applying can never double-link the same asset.
CREATE UNIQUE INDEX "iilca_tenant_line_asset_key" ON "ingested_invoice_line_created_asset" ("tenantId", "lineId", "equipmentAssetId");
CREATE INDEX "iilca_tenantId_idx" ON "ingested_invoice_line_created_asset" ("tenantId");
CREATE INDEX "iilca_tenant_line_idx" ON "ingested_invoice_line_created_asset" ("tenantId", "lineId");

ALTER TABLE "ingested_invoice_line_created_asset"
  ADD CONSTRAINT "iilca_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingested_invoice_line_created_asset"
  ADD CONSTRAINT "iilca_tenant_line_fkey"
  FOREIGN KEY ("tenantId", "lineId") REFERENCES "ingested_invoice_line"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingested_invoice_line_created_asset"
  ADD CONSTRAINT "iilca_tenant_asset_fkey"
  FOREIGN KEY ("tenantId", "equipmentAssetId") REFERENCES "equipment_asset"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4. RLS (TENANT-1) ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "ingested_invoice_line_created_asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingested_invoice_line_created_asset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ingested_invoice_line_created_asset"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ingested_invoice_line_created_asset" TO app_rls;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ingested_invoice_line_created_asset'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on ingested_invoice_line_created_asset';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'ingested_invoice_line_created_asset' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION 'tenant_isolation policy missing on ingested_invoice_line_created_asset';
  END IF;
END
$$;
