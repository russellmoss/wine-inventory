-- Plan 039 Unit 5: a work-order task can target a VINEYARD BLOCK (for the HARVEST_WEIGH_IN
-- observation block). Adds the canonical column + the Phase-12 composite FK
-- (tenantId, blockId) → vineyard_block(tenantId, id), so a block reference can never cross
-- a tenant boundary. Column-only add on the RLS-forced work_order_task — RLS-neutral.

-- vineyard_block needs a (tenantId, id) unique to be a composite-FK target.
ALTER TABLE "vineyard_block" ADD CONSTRAINT "vineyard_block_tenantId_id_key" UNIQUE ("tenantId", "id");

-- AlterTable
ALTER TABLE "work_order_task" ADD COLUMN     "blockId" TEXT;

-- CreateIndex
CREATE INDEX "work_order_task_tenantId_blockId_idx" ON "work_order_task"("tenantId", "blockId");

-- AddForeignKey (composite, tenant-safe; RESTRICT so a block with WO history isn't silently erased)
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_blockId_fkey" FOREIGN KEY ("tenantId", "blockId") REFERENCES "vineyard_block"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
