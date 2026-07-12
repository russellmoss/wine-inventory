-- Plan 053 B10: equipment registry + advisory task↔equipment join (schema + FKs; RLS in the next migration).
-- Tenant-scoped. Composite cross-tenant FKs pin the join to work_order_task(tenantId,id) + equipment_asset(tenantId,id).

CREATE TABLE "equipment_asset" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "locationId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "equipment_asset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "equipment_asset_tenantId_name_key" ON "equipment_asset"("tenantId", "name");
CREATE UNIQUE INDEX "equipment_asset_tenantId_id_key" ON "equipment_asset"("tenantId", "id");
CREATE INDEX "equipment_asset_tenantId_idx" ON "equipment_asset"("tenantId");
-- Promote the (tenantId, id) unique index to a constraint so it can be an FK target.
ALTER TABLE "equipment_asset" ADD CONSTRAINT "equipment_asset_tenantId_id_key" UNIQUE USING INDEX "equipment_asset_tenantId_id_key";
ALTER TABLE "equipment_asset" ADD CONSTRAINT "equipment_asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_order_task_equipment" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_task_equipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_task_equipment_tenantId_taskId_equipmentId_key" ON "work_order_task_equipment"("tenantId", "taskId", "equipmentId");
CREATE INDEX "work_order_task_equipment_tenantId_equipmentId_idx" ON "work_order_task_equipment"("tenantId", "equipmentId");
CREATE INDEX "work_order_task_equipment_tenantId_taskId_idx" ON "work_order_task_equipment"("tenantId", "taskId");
ALTER TABLE "work_order_task_equipment" ADD CONSTRAINT "work_order_task_equipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_task_equipment" ADD CONSTRAINT "work_order_task_equipment_task_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "work_order_task"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "work_order_task_equipment" ADD CONSTRAINT "work_order_task_equipment_equipment_fkey" FOREIGN KEY ("tenantId", "equipmentId") REFERENCES "equipment_asset"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
