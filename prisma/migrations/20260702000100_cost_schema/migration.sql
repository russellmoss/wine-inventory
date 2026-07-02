-- Phase 8 Units 1/2: supply stock + cost roll-up schema (D16 separated concerns). Six new
-- tenant-scoped tables + additive columns on cellar_material / lot / app_settings, the
-- composite-tenant-FK targets (K11), and the lot_lineage recursive-CTE indexes. RLS lands in the
-- next migration (20260702000200_cost_rls). app_rls DML is auto-granted by ALTER DEFAULT PRIVILEGES
-- (20260701000900_app_rls_role); the RLS migration re-grants explicitly as belt-and-braces.
-- Money is DECIMAL(18,8) internally (D9); volumes stay DECIMAL(10,2); cost-per-bottle rounds to cents.
-- NOT deployed until the operator runs `prisma migrate deploy`.

SET lock_timeout = '5s';

-- ─────────────── Unit 1: extend cellar_material (stock + cost, all additive) ───────────────
ALTER TABLE "cellar_material" ADD COLUMN "packagingSize" DECIMAL(18,6);
ALTER TABLE "cellar_material" ADD COLUMN "stockUnit" TEXT;
ALTER TABLE "cellar_material" ADD COLUMN "isStockTracked" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────── Unit 2 (D19 seam): lot ownership ───────────────
ALTER TABLE "lot" ADD COLUMN "ownership" "LotOwnership" NOT NULL DEFAULT 'ESTATE';

-- ─────────────── Unit 2 (D5/D9/D17): per-tenant costing policy on app_settings ───────────────
ALTER TABLE "app_settings" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "app_settings" ADD COLUMN "costingMethod" "CostingMethod" NOT NULL DEFAULT 'WEIGHTED_AVG';
ALTER TABLE "app_settings" ADD COLUMN "costingMethodEffectiveAt" TIMESTAMP(3);
ALTER TABLE "app_settings" ADD COLUMN "capitalizeFruit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_settings" ADD COLUMN "capitalizeBarrel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_settings" ADD COLUMN "capitalizeLabor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_settings" ADD COLUMN "capitalizeOverhead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_settings" ADD COLUMN "capitalizePackaging" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_settings" ADD COLUMN "costingPolicyVersion" INTEGER NOT NULL DEFAULT 1;

-- ─────────────── Composite-tenant-FK targets: UNIQUE(tenantId, id) on the referenced tables ───────────────
-- Postgres FKs can only reference a unique CONSTRAINT/PK. Names match Prisma's @@unique convention so
-- there is no drift. lot already carries lot_tenantId_id_key (Phase 12), so it is not repeated here.
ALTER TABLE "cellar_material" ADD CONSTRAINT "cellar_material_tenantId_id_key" UNIQUE ("tenantId", "id");
ALTER TABLE "lot_operation" ADD CONSTRAINT "lot_operation_tenantId_id_key" UNIQUE ("tenantId", "id");
ALTER TABLE "bottling_run" ADD CONSTRAINT "bottling_run_tenantId_id_key" UNIQUE ("tenantId", "id");
ALTER TABLE "wine_sku" ADD CONSTRAINT "wine_sku_tenantId_id_key" UNIQUE ("tenantId", "id");

-- ─────────────── Unit 1: supply_lot (costed receipt) ───────────────
CREATE TABLE "supply_lot" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qtyReceived" DECIMAL(18,6) NOT NULL,
    "qtyRemaining" DECIMAL(18,6) NOT NULL,
    "stockUnit" TEXT NOT NULL,
    "unitCost" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lotCode" TEXT,
    "supplierNote" TEXT,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_lot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supply_lot_tenantId_id_key" UNIQUE ("tenantId", "id"),
    -- physical stock never goes negative; a costed receipt never negative
    CONSTRAINT "supply_lot_qty_nonneg_chk" CHECK ("qtyReceived" >= 0 AND "qtyRemaining" >= 0)
);

-- ─────────────── Unit 2: cost_line (direct absorbed cost, tagged by component) ───────────────
CREATE TABLE "cost_line" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "operationId" INTEGER NOT NULL,
    "lotId" TEXT,
    "component" "CostComponent" NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'KNOWN',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "reversalOfCostLineId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_line_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Unit 2 (D11): supply_consumption (physical + cost depletion ledger) ───────────────
CREATE TABLE "supply_consumption" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "operationId" INTEGER NOT NULL,
    "supplyLotId" TEXT NOT NULL,
    "qty" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,8),
    "extendedCost" DECIMAL(18,8),
    "methodUsed" "CostingMethod" NOT NULL,
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'KNOWN',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "reversalOfConsumptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_consumption_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Unit 2 (D10): operation_cost_transfer (immutable lot→lot inherited cost) ───────────────
CREATE TABLE "operation_cost_transfer" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "operationId" INTEGER NOT NULL,
    "fromLotId" TEXT NOT NULL,
    "toLotId" TEXT NOT NULL,
    "transferredVolumeL" DECIMAL(10,2) NOT NULL,
    "parentPreOpVolumeL" DECIMAL(10,2) NOT NULL,
    "transferredCost" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "reversalOfTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_cost_transfer_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Unit 2 (D15/D18): bottling_cost_snapshot (frozen COGS + Phase-15 export seam) ───────────────
CREATE TABLE "bottling_cost_snapshot" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "taxClass" TEXT,
    "bottledAt" TIMESTAMP(3) NOT NULL,
    "goodBottles" INTEGER NOT NULL,
    "totalRunCost" DECIMAL(18,8) NOT NULL,
    "costPerBottle" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "costBasisAsOfOperationId" INTEGER,
    "componentBreakdown" JSONB NOT NULL,
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'KNOWN',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "postingKey" TEXT,
    "sourceSnapshotId" TEXT,
    "reversalOfSnapshotId" TEXT,
    "postedAt" TIMESTAMP(3),
    "externalSystemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bottling_cost_snapshot_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Unit 2/5 (D4): lot_cost_state (lazy versioned cache — NOT an invariant projection) ───────────────
CREATE TABLE "lot_cost_state" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "lotId" TEXT NOT NULL,
    "totalCost" DECIMAL(18,8) NOT NULL,
    "volumeL" DECIMAL(10,2) NOT NULL,
    "costPerL" DECIMAL(18,8),
    "basisCompleteness" "CostBasisCompleteness" NOT NULL DEFAULT 'UNKNOWN',
    "computedThroughOpId" INTEGER NOT NULL DEFAULT 0,
    "basisVersion" INTEGER NOT NULL DEFAULT 1,
    "componentBreakdown" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lot_cost_state_pkey" PRIMARY KEY ("lotId")
);

-- ─────────────── Indexes ───────────────
CREATE INDEX "supply_lot_tenantId_idx" ON "supply_lot"("tenantId");
CREATE INDEX "supply_lot_tenantId_materialId_receivedAt_idx" ON "supply_lot"("tenantId", "materialId", "receivedAt");
-- FIFO / on-hand fast path: only the not-yet-depleted lots (Codex perf note; partial, not Prisma-expressible).
CREATE INDEX "supply_lot_available_idx" ON "supply_lot"("tenantId", "materialId", "receivedAt") WHERE "qtyRemaining" > 0;

CREATE INDEX "cost_line_tenantId_idx" ON "cost_line"("tenantId");
CREATE INDEX "cost_line_tenantId_operationId_component_idx" ON "cost_line"("tenantId", "operationId", "component");
CREATE INDEX "cost_line_tenantId_lotId_idx" ON "cost_line"("tenantId", "lotId");

CREATE INDEX "supply_consumption_tenantId_idx" ON "supply_consumption"("tenantId");
CREATE INDEX "supply_consumption_tenantId_operationId_idx" ON "supply_consumption"("tenantId", "operationId");
CREATE INDEX "supply_consumption_tenantId_supplyLotId_idx" ON "supply_consumption"("tenantId", "supplyLotId");

CREATE INDEX "operation_cost_transfer_tenantId_idx" ON "operation_cost_transfer"("tenantId");
CREATE INDEX "operation_cost_transfer_tenantId_toLotId_idx" ON "operation_cost_transfer"("tenantId", "toLotId");
CREATE INDEX "operation_cost_transfer_tenantId_fromLotId_idx" ON "operation_cost_transfer"("tenantId", "fromLotId");
CREATE INDEX "operation_cost_transfer_tenantId_operationId_idx" ON "operation_cost_transfer"("tenantId", "operationId");

CREATE INDEX "bottling_cost_snapshot_tenantId_idx" ON "bottling_cost_snapshot"("tenantId");
CREATE INDEX "bottling_cost_snapshot_tenantId_skuId_runId_idx" ON "bottling_cost_snapshot"("tenantId", "skuId", "runId");
CREATE INDEX "bottling_cost_snapshot_tenantId_taxClass_bottledAt_idx" ON "bottling_cost_snapshot"("tenantId", "taxClass", "bottledAt");
-- Per-tenant idempotency for accounting export (D18). NULL postingKeys are distinct in Postgres, so
-- many unposted snapshots coexist; only a real postingKey must be unique per tenant.
CREATE UNIQUE INDEX "bottling_cost_snapshot_tenantId_postingKey_key" ON "bottling_cost_snapshot"("tenantId", "postingKey");

CREATE INDEX "lot_cost_state_tenantId_idx" ON "lot_cost_state"("tenantId");

-- Phase 8 (Unit 2): tenant-scoped lot_lineage edge indexes for the recursive-CTE cost walk.
CREATE INDEX "lot_lineage_tenantId_parentLotId_idx" ON "lot_lineage"("tenantId", "parentLotId");
CREATE INDEX "lot_lineage_tenantId_childLotId_idx" ON "lot_lineage"("tenantId", "childLotId");

-- ─────────────── Foreign keys: tenantId → organization (Phase-12 checklist item 2) ───────────────
ALTER TABLE "supply_lot" ADD CONSTRAINT "supply_lot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_consumption" ADD CONSTRAINT "supply_consumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_cost_transfer" ADD CONSTRAINT "operation_cost_transfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bottling_cost_snapshot" ADD CONSTRAINT "bottling_cost_snapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lot_cost_state" ADD CONSTRAINT "lot_cost_state_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs to the ledger (K11): (tenantId, refId) → parent(tenantId, id) ───────────────
-- supply_lot → cellar_material
ALTER TABLE "supply_lot" ADD CONSTRAINT "supply_lot_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- cost_line → lot_operation (RESTRICT), → lot (SET NULL on lotId only; nullable)
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "lot_operation"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("lotId");

-- supply_consumption → lot_operation (RESTRICT), → supply_lot (RESTRICT)
ALTER TABLE "supply_consumption" ADD CONSTRAINT "supply_consumption_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "lot_operation"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "supply_consumption" ADD CONSTRAINT "supply_consumption_tenantId_supplyLotId_fkey" FOREIGN KEY ("tenantId", "supplyLotId") REFERENCES "supply_lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- operation_cost_transfer → lot_operation (RESTRICT), → lot x2 (RESTRICT)
ALTER TABLE "operation_cost_transfer" ADD CONSTRAINT "operation_cost_transfer_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "lot_operation"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "operation_cost_transfer" ADD CONSTRAINT "operation_cost_transfer_tenantId_fromLotId_fkey" FOREIGN KEY ("tenantId", "fromLotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "operation_cost_transfer" ADD CONSTRAINT "operation_cost_transfer_tenantId_toLotId_fkey" FOREIGN KEY ("tenantId", "toLotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- bottling_cost_snapshot → bottling_run (RESTRICT), → wine_sku (RESTRICT)
ALTER TABLE "bottling_cost_snapshot" ADD CONSTRAINT "bottling_cost_snapshot_tenantId_runId_fkey" FOREIGN KEY ("tenantId", "runId") REFERENCES "bottling_run"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "bottling_cost_snapshot" ADD CONSTRAINT "bottling_cost_snapshot_tenantId_skuId_fkey" FOREIGN KEY ("tenantId", "skuId") REFERENCES "wine_sku"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- lot_cost_state → lot (CASCADE — the cache dies with its lot)
ALTER TABLE "lot_cost_state" ADD CONSTRAINT "lot_cost_state_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
