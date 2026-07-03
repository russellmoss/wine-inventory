-- Phase 9.1 Unit 3 fix — the vessel_activity_event → work_order_task composite FK must be ON DELETE
-- RESTRICT, not SET NULL. A composite (tenantId, taskId) FK with SET NULL would null BOTH columns on a
-- task delete, including the NOT-NULL tenantId → a null-constraint violation (and a silent tenant wipe if
-- it didn't). A recorded activity event is history: it should pin its task (matches the reservation→task
-- FK pattern). Events created outside a WO still have a null taskId (the FK is only checked when set).
ALTER TABLE "vessel_activity_event" DROP CONSTRAINT "vessel_activity_event_tenantId_taskId_fkey";
ALTER TABLE "vessel_activity_event" ADD CONSTRAINT "vessel_activity_event_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "work_order_task"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
