import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderPickers, listOrgMembers, listDependableWorkOrders, listLocations } from "@/lib/work-orders/data";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { WorkOrderBuilderClient } from "./WorkOrderBuilderClient";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const [pickers, members, dependableWorkOrders, locations, vocab] = await Promise.all([
    getWorkOrderPickers(tenantId),
    listOrgMembers(tenantId),
    listDependableWorkOrders(tenantId),
    listLocations(tenantId),
    resolveTaskVocabulary(),
  ]);
  return (
    <WorkOrderBuilderClient
      pickers={pickers}
      members={members}
      dependableWorkOrders={dependableWorkOrders}
      locations={locations}
      vocab={vocab}
    />
  );
}
