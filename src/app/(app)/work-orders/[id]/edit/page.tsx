import { notFound, redirect } from "next/navigation";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import {
  getWorkOrderForEdit,
  getWorkOrderPickers,
  listOrgMembers,
  listDependableWorkOrders,
  listLocations,
} from "@/lib/work-orders/data";
import { listEquipment } from "@/lib/equipment/equipment";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { workOrderTasksToBuilds } from "@/lib/work-orders/task-to-build";
import { WorkOrderBuilderClient, type ExistingWorkOrderSeed } from "../../new/WorkOrderBuilderClient";

export const dynamic = "force-dynamic";

// Plan 071: reopen a work order in the full builder for in-place editing. Admin/developer only; a
// finalized (APPROVED) or CANCELLED WO has nothing editable, so we bounce back to the detail view.
export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return notFound();
  if (!isTenantAdminLike(user)) redirect(`/work-orders/${id}`);

  const wo = await getWorkOrderForEdit(tenantId, id);
  if (!wo) return notFound();
  if (wo.status === "APPROVED" || wo.status === "CANCELLED") redirect(`/work-orders/${id}`);

  const [pickers, members, dependableWorkOrders, locations, equipment, vocab] = await Promise.all([
    getWorkOrderPickers(tenantId),
    listOrgMembers(tenantId),
    listDependableWorkOrders(tenantId),
    listLocations(tenantId),
    listEquipment(tenantId, { activeOnly: true }),
    resolveTaskVocabulary(),
  ]);

  const { groups } = workOrderTasksToBuilds(wo.tasks, vocab, new Map(Object.entries(wo.equipmentByTask)));
  const existing: ExistingWorkOrderSeed = {
    workOrderId: wo.id,
    status: wo.status,
    groups,
    title: wo.title,
    leadEmail: wo.assigneeEmail ?? "",
    priority: wo.priority || "NORMAL",
    locationId: wo.locationId ?? "",
    // Hand the raw instant + its precision to the client, which localizes it to the viewer's timezone on
    // mount — the server can't know that zone, and slicing the ISO string here would drop the time of day.
    dueAtIso: wo.dueAt,
    dueAtHasTime: wo.dueAtHasTime,
    dependsOn: wo.dependsOn,
  };

  return (
    <WorkOrderBuilderClient
      pickers={pickers}
      members={members}
      dependableWorkOrders={dependableWorkOrders}
      locations={locations}
      equipment={equipment.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
      vocab={vocab}
      existing={existing}
    />
  );
}
