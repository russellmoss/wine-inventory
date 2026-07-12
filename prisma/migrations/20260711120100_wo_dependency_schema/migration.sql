-- Plan 053 A5: cross-order work-order dependency edges (schema + FKs; RLS follows in the next migration).
-- Tenant-scoped. Composite cross-tenant FKs pin both endpoints to work_order(tenantId, id) — the unique
-- constraint that already exists (work_order_tenantId_id_key) — so an edge can never span tenants.

CREATE TABLE "work_order_dependency" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "dependsOnWorkOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    CONSTRAINT "work_order_dependency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_order_dependency_tenantId_workOrderId_dependsOnWorkOrderId_key" ON "work_order_dependency"("tenantId", "workOrderId", "dependsOnWorkOrderId");
CREATE INDEX "work_order_dependency_tenantId_workOrderId_idx" ON "work_order_dependency"("tenantId", "workOrderId");
CREATE INDEX "work_order_dependency_tenantId_dependsOnWorkOrderId_idx" ON "work_order_dependency"("tenantId", "dependsOnWorkOrderId");

-- Tenant FK → organization (ON DELETE RESTRICT, per the Phase-12 checklist).
ALTER TABLE "work_order_dependency" ADD CONSTRAINT "work_order_dependency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite cross-tenant FKs to work_order (both endpoints). Mirrors work_order_task/reservation.
ALTER TABLE "work_order_dependency" ADD CONSTRAINT "work_order_dependency_tenantId_workOrderId_fkey" FOREIGN KEY ("tenantId", "workOrderId") REFERENCES "work_order"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "work_order_dependency" ADD CONSTRAINT "work_order_dependency_tenantId_dependsOnWorkOrderId_fkey" FOREIGN KEY ("tenantId", "dependsOnWorkOrderId") REFERENCES "work_order"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
