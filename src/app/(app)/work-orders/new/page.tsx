import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderPickers, listOrgMembers, listDependableWorkOrders, listLocations } from "@/lib/work-orders/data";
import { listEquipment } from "@/lib/equipment/equipment";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { WorkOrderBuilderClient } from "./WorkOrderBuilderClient";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const [pickers, members, dependableWorkOrders, locations, equipment, vocab] = await Promise.all([
    getWorkOrderPickers(tenantId),
    listOrgMembers(tenantId),
    listDependableWorkOrders(tenantId),
    listLocations(tenantId),
    listEquipment(tenantId, { activeOnly: true }),
    resolveTaskVocabulary(),
  ]);
  return (
    <WorkOrderBuilderClient
      pickers={pickers}
      members={members}
      dependableWorkOrders={dependableWorkOrders}
      locations={locations}
      equipment={equipment.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
      vocab={vocab}
    />
  );
}
