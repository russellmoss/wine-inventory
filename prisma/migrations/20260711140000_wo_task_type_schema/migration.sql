-- Plan 053 C11: tenant-authored "Custom Log" task types (record-only; RLS in the next migration).
-- No kind/opType column by design — a custom log can only ever be a NOTE.
CREATE TABLE "work_order_task_type" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldsJson" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_order_task_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_task_type_tenantId_code_key" ON "work_order_task_type"("tenantId", "code");
CREATE INDEX "work_order_task_type_tenantId_idx" ON "work_order_task_type"("tenantId");
ALTER TABLE "work_order_task_type" ADD CONSTRAINT "work_order_task_type_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
