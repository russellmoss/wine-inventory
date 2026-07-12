-- Plan 053 C12: per-tenant display overlays on built-in task types (hide/relabel/reorder). RLS follows.
CREATE TABLE "work_order_task_type_overlay" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "baseTaskType" TEXT NOT NULL,
    "hiddenFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "relabels" JSONB NOT NULL DEFAULT '{}',
    "fieldOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_order_task_type_overlay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_task_type_overlay_tenantId_baseTaskType_key" ON "work_order_task_type_overlay"("tenantId", "baseTaskType");
CREATE INDEX "work_order_task_type_overlay_tenantId_idx" ON "work_order_task_type_overlay"("tenantId");
ALTER TABLE "work_order_task_type_overlay" ADD CONSTRAINT "work_order_task_type_overlay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
