-- Phase 9 follow-up (review finding): change reservation.taskId FK from ON DELETE RESTRICT to CASCADE.
-- reservation is already an ON DELETE CASCADE child of work_order (via workOrderId), and work_order_task
-- is itself a CASCADE child of work_order. With taskId on RESTRICT, deleting a work_order that has a
-- task-scoped reservation relied on undocumented trigger name-ordering (reservation_* firing before
-- work_order_task_*), and a direct DELETE of a work_order_task was blocked by any reservation. CASCADE is
-- redundant with the workOrderId cascade for the WO-delete path and removes the ordering hazard. SET NULL
-- is not an option here (composite FK over the NOT-NULL tenantId).

ALTER TABLE "reservation" DROP CONSTRAINT "reservation_tenantId_taskId_fkey";
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "work_order_task"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
