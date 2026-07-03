-- Phase 16 Unit 1 — Commerce7 DTC/sales integration schema. Five new tenant-scoped tables built to the
-- AGENTS.md Phase-12 checklist (tenantId + @@index, composite tenant FK -> organization ON DELETE
-- RESTRICT, per-tenant uniques, and — in the sibling _commerce7_rls migration — RLS ENABLE+FORCE + a
-- tenant_isolation policy + app_rls grant). Plus: the DTC sales-account columns on app_settings, the
-- salesExportEventId leg on accounting_delivery (delivery source becomes exactly-one-of-THREE), and the
-- composite tenant FKs (K11). NO token/secret columns — the Commerce7 app Secret Key is env-resident.

SET lock_timeout = '5s';

-- ─────────────── commerce7_connection (per-tenant link; NO secret columns) ───────────────
CREATE TABLE "commerce7_connection" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "provider" "CommerceProvider" NOT NULL DEFAULT 'COMMERCE7',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "environment" TEXT NOT NULL,
    "externalTenantId" TEXT,
    "scopes" TEXT[],
    "installedByUserId" TEXT,
    "webhookId" TEXT,
    "webhookConfiguredAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "pollCursorUpdatedAt" TIMESTAMP(3),
    "pollCursorId" TEXT,
    "companyName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce7_connection_pkey" PRIMARY KEY ("id")
);

-- ─────────────── commerce7_install_state (short-lived, single-use install nonce — reuses OAuthState) ───────────────
CREATE TABLE "commerce7_install_state" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce7_install_state_pkey" PRIMARY KEY ("id")
);

-- ─────────────── commerce7_sku_map (C7 variant+location ↔ WineSku+Location + outbound watermark) ───────────────
CREATE TABLE "commerce7_sku_map" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "externalVariantId" TEXT NOT NULL,
    "externalSku" TEXT NOT NULL,
    "externalInventoryLocationId" TEXT NOT NULL,
    "wineSkuId" TEXT,
    "locationId" TEXT,
    "lastPushedMovementAt" TIMESTAMP(3),
    "lastPushedMovementId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce7_sku_map_pkey" PRIMARY KEY ("id")
);

-- ─────────────── commerce7_order (MUTABLE order projection, NO PII) ───────────────
CREATE TABLE "commerce7_order" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "commerce7OrderId" TEXT NOT NULL,
    "commerce7OrderNumber" TEXT,
    "commerce7CustomerId" TEXT,
    "channel" TEXT,
    "paymentStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "normalizedSnapshot" JSONB,
    "lastDeltaSeq" INTEGER NOT NULL DEFAULT 0,
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "withheldReason" TEXT,
    "lastSeenUpdatedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce7_order_pkey" PRIMARY KEY ("id")
);

-- ─────────────── sales_export_event (IMMUTABLE revenue delta, NO PII) ───────────────
CREATE TABLE "sales_export_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "postingKey" TEXT NOT NULL,
    "commerce7OrderId" TEXT NOT NULL,
    "deltaSeq" INTEGER NOT NULL,
    "kind" "SalesDeltaKind" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "channel" TEXT,
    "revenueDelta" DECIMAL(18,8) NOT NULL,
    "salesTaxDelta" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "shippingDelta" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "discountDelta" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "lineDeltas" JSONB NOT NULL,
    "revenueAccount" TEXT,
    "clearingAccount" TEXT,
    "taxAccount" TEXT,
    "shippingAccount" TEXT,
    "discountAccount" TEXT,
    "reversalOfSalesExportEventId" TEXT,
    "accountingDate" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_export_event_pkey" PRIMARY KEY ("id")
);

-- ─────────────── DTC sales accounts on app_settings (winery-wide, like AP; additive + nullable) ───────────────
ALTER TABLE "app_settings" ADD COLUMN "dtcRevenueAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "dtcTaxAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "dtcShippingAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "dtcClearingAccount" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "dtcDiscountAccount" TEXT;

-- ─────────────── accounting_delivery gains the third source leg (sales export delta) ───────────────
ALTER TABLE "accounting_delivery" ADD COLUMN "salesExportEventId" TEXT;

-- ─────────────── Indexes / uniques ───────────────
CREATE UNIQUE INDEX "commerce7_connection_tenantId_provider_key" ON "commerce7_connection"("tenantId", "provider");
CREATE UNIQUE INDEX "commerce7_connection_tenantId_id_key" ON "commerce7_connection"("tenantId", "id");
CREATE INDEX "commerce7_connection_tenantId_idx" ON "commerce7_connection"("tenantId");

CREATE UNIQUE INDEX "commerce7_install_state_tenantId_nonceHash_key" ON "commerce7_install_state"("tenantId", "nonceHash");
CREATE INDEX "commerce7_install_state_tenantId_idx" ON "commerce7_install_state"("tenantId");
CREATE INDEX "commerce7_install_state_expiresAt_idx" ON "commerce7_install_state"("expiresAt");

CREATE UNIQUE INDEX "commerce7_sku_map_tenantId_externalVariantId_externalInventoryLocationId_key" ON "commerce7_sku_map"("tenantId", "externalVariantId", "externalInventoryLocationId");
CREATE INDEX "commerce7_sku_map_tenantId_idx" ON "commerce7_sku_map"("tenantId");
CREATE INDEX "commerce7_sku_map_tenantId_wineSkuId_idx" ON "commerce7_sku_map"("tenantId", "wineSkuId");

CREATE UNIQUE INDEX "commerce7_order_tenantId_commerce7OrderId_key" ON "commerce7_order"("tenantId", "commerce7OrderId");
CREATE UNIQUE INDEX "commerce7_order_tenantId_id_key" ON "commerce7_order"("tenantId", "id");
CREATE INDEX "commerce7_order_tenantId_idx" ON "commerce7_order"("tenantId");
CREATE INDEX "commerce7_order_tenantId_dirty_idx" ON "commerce7_order"("tenantId", "dirty");
CREATE INDEX "commerce7_order_tenantId_lastSeenUpdatedAt_commerce7OrderId_idx" ON "commerce7_order"("tenantId", "lastSeenUpdatedAt", "commerce7OrderId");

CREATE UNIQUE INDEX "sales_export_event_tenantId_postingKey_key" ON "sales_export_event"("tenantId", "postingKey");
CREATE UNIQUE INDEX "sales_export_event_tenantId_id_key" ON "sales_export_event"("tenantId", "id");
CREATE INDEX "sales_export_event_tenantId_idx" ON "sales_export_event"("tenantId");
CREATE INDEX "sales_export_event_tenantId_commerce7OrderId_idx" ON "sales_export_event"("tenantId", "commerce7OrderId");

CREATE UNIQUE INDEX "accounting_delivery_tenantId_salesExportEventId_key" ON "accounting_delivery"("tenantId", "salesExportEventId");

-- ─────────────── Promote (tenantId, id) unique INDEXES to CONSTRAINTS (Postgres FKs need a unique
-- constraint, not a bare index; names preserved -> no Prisma drift) ───────────────
ALTER TABLE "commerce7_connection" ADD CONSTRAINT "commerce7_connection_tenantId_id_key" UNIQUE USING INDEX "commerce7_connection_tenantId_id_key";
ALTER TABLE "commerce7_order" ADD CONSTRAINT "commerce7_order_tenantId_id_key" UNIQUE USING INDEX "commerce7_order_tenantId_id_key";
ALTER TABLE "sales_export_event" ADD CONSTRAINT "sales_export_event_tenantId_id_key" UNIQUE USING INDEX "sales_export_event_tenantId_id_key";

-- ─────────────── FKs: tenantId -> organization (Phase-12 checklist, ON DELETE RESTRICT) ───────────────
ALTER TABLE "commerce7_connection" ADD CONSTRAINT "commerce7_connection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commerce7_install_state" ADD CONSTRAINT "commerce7_install_state_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commerce7_sku_map" ADD CONSTRAINT "commerce7_sku_map_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commerce7_order" ADD CONSTRAINT "commerce7_order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_export_event" ADD CONSTRAINT "sales_export_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs (K11 — cross-tenant references structurally impossible) ───────────────
-- commerce7_sku_map.wineSkuId -> wine_sku(tenantId, id). SET NULL on delete so removing a WineSku
-- leaves the mapping row un-mapped (→ withhold) rather than blocking the delete.
ALTER TABLE "commerce7_sku_map" ADD CONSTRAINT "commerce7_sku_map_tenantId_wineSkuId_fkey" FOREIGN KEY ("tenantId", "wineSkuId") REFERENCES "wine_sku"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL;
-- accounting_delivery.salesExportEventId -> sales_export_event(tenantId, id).
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_tenantId_salesExportEventId_fkey" FOREIGN KEY ("tenantId", "salesExportEventId") REFERENCES "sales_export_event"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── Delivery source: exactly-one-of-THREE (Phase 15 was cost XOR ap) ───────────────
-- Replace the two-way XOR with a three-way "exactly one non-null" check now that a delivery can source
-- from a sales export delta too (the one-poster/one-state-machine invariant, A2).
ALTER TABLE "accounting_delivery" DROP CONSTRAINT "accounting_delivery_one_source";
ALTER TABLE "accounting_delivery" ADD CONSTRAINT "accounting_delivery_one_source"
  CHECK ((("costExportEventId" IS NOT NULL)::int + ("apExportEventId" IS NOT NULL)::int + ("salesExportEventId" IS NOT NULL)::int) = 1);

-- ─────────────── Global one-install guard (SEC-C2 analogue): one ACTIVE Commerce7 tenant attaches to
-- at most one of our tenants per provider. Cross-tenant (no tenantId in the key), partial (only
-- CONNECTED rows), so disconnect frees the external tenant to re-link elsewhere. ───────────────
CREATE UNIQUE INDEX "commerce7_connection_active_external_key"
  ON "commerce7_connection" ("provider", "externalTenantId")
  WHERE "status" = 'CONNECTED' AND "externalTenantId" IS NOT NULL;

-- Scale: the poll/inventory sweeps only ever scan OPEN work; a partial index keeps the dirty-order scan
-- a bounded seek as POSTED history grows (scale-register tripwire).
CREATE INDEX "commerce7_order_dirty_active_idx" ON "commerce7_order" ("tenantId") WHERE "dirty" = true;

-- ─────────────── app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "commerce7_connection" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "commerce7_install_state" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "commerce7_sku_map" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "commerce7_order" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "sales_export_event" TO app_rls;

-- NOTE: the commerce crons reuse the accounting_enumerator role, which lists org ids (SELECT on
-- organization) and NOTHING else — the per-tenant reads (connection, orders, mappings) happen under
-- app_rls via runAsTenant, never as the enumerator. So no new enumerator grant is required here.
