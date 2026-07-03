-- Phase 9.1 Unit 3 — vessel-activity schema. Two new tenant-scoped tables (the lotless activity event +
-- its append-only overhead supply-depletion ledger) built to the AGENTS.md Phase-12 checklist, plus the
-- activityType discriminator column on work_order_task (A3). Cluster edge (event↔supply_use) and external
-- refs (vessel / cellar_material / supply_lot / work_order_task) are COMPOSITE (tenantId, refId)→
-- (tenantId, id) at the DB level (K11); Prisma relations stay single-column. RLS lives in the sibling
-- _vessel_activity_rls migration.

SET lock_timeout = '5s';

-- A3: the maintenance subtype discriminator on the task (validated String mirror of VesselActivityKind).
ALTER TABLE "work_order_task" ADD COLUMN "activityType" TEXT;

-- ─────────────── vessel_activity_event (lotless, vessel-scoped; NO ledger op) ───────────────
CREATE TABLE "vessel_activity_event" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "kind" "VesselActivityKind" NOT NULL,
    "taskId" TEXT,
    "attemptId" TEXT,
    "targetValue" DECIMAL(18,6),
    "targetUnit" TEXT,
    "achievedValue" DECIMAL(18,6),
    "achievedUnit" TEXT,
    "materialId" TEXT,
    "note" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredByEmail" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vessel_activity_event_pkey" PRIMARY KEY ("id")
);

-- ─────────────── vessel_activity_supply_use (append-only overhead depletion; OUTSIDE the wine roll-up) ─────
CREATE TABLE "vessel_activity_supply_use" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vesselActivityEventId" TEXT NOT NULL,
    "supplyLotId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "qty" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(18,8),
    "extendedCost" DECIMAL(18,8),
    "reversalOfSupplyUseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vessel_activity_supply_use_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Uniques + (tenantId, id) targets + indexes ───────────────
CREATE UNIQUE INDEX "vessel_activity_event_commandId_key" ON "vessel_activity_event"("commandId");
CREATE UNIQUE INDEX "vessel_activity_event_tenantId_id_key" ON "vessel_activity_event"("tenantId", "id");
CREATE INDEX "vessel_activity_event_tenantId_idx" ON "vessel_activity_event"("tenantId");
CREATE INDEX "vessel_activity_event_tenantId_vesselId_idx" ON "vessel_activity_event"("tenantId", "vesselId");
CREATE INDEX "vessel_activity_event_tenantId_taskId_idx" ON "vessel_activity_event"("tenantId", "taskId");

CREATE UNIQUE INDEX "vessel_activity_supply_use_tenantId_id_key" ON "vessel_activity_supply_use"("tenantId", "id");
CREATE INDEX "vessel_activity_supply_use_tenantId_idx" ON "vessel_activity_supply_use"("tenantId");
CREATE INDEX "vessel_activity_supply_use_tenantId_vesselActivityEventId_idx" ON "vessel_activity_supply_use"("tenantId", "vesselActivityEventId");
CREATE INDEX "vessel_activity_supply_use_tenantId_supplyLotId_idx" ON "vessel_activity_supply_use"("tenantId", "supplyLotId");

-- Promote (tenantId, id) unique INDEXES to CONSTRAINTS (Postgres FKs need a unique constraint) ───────────
ALTER TABLE "vessel_activity_event" ADD CONSTRAINT "vessel_activity_event_tenantId_id_key" UNIQUE USING INDEX "vessel_activity_event_tenantId_id_key";

-- ─────────────── FKs: tenantId → organization (Phase-12 checklist, ON DELETE RESTRICT) ───────────────
ALTER TABLE "vessel_activity_event" ADD CONSTRAINT "vessel_activity_event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vessel_activity_supply_use" ADD CONSTRAINT "vessel_activity_supply_use_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs — cluster edge (K11: cross-tenant edges structurally impossible) ────
ALTER TABLE "vessel_activity_supply_use" ADD CONSTRAINT "vessel_activity_supply_use_tenantId_eventId_fkey" FOREIGN KEY ("tenantId", "vesselActivityEventId") REFERENCES "vessel_activity_event"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;

-- ─────────────── Composite tenant FKs — external refs (RESTRICT; nullable ones checked only when set) ─────
ALTER TABLE "vessel_activity_event" ADD CONSTRAINT "vessel_activity_event_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "vessel_activity_event" ADD CONSTRAINT "vessel_activity_event_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "vessel_activity_event" ADD CONSTRAINT "vessel_activity_event_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "work_order_task"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "vessel_activity_supply_use" ADD CONSTRAINT "vessel_activity_supply_use_tenantId_supplyLotId_fkey" FOREIGN KEY ("tenantId", "supplyLotId") REFERENCES "supply_lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "vessel_activity_supply_use" ADD CONSTRAINT "vessel_activity_supply_use_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "vessel_activity_event" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vessel_activity_supply_use" TO app_rls;
