import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderDashboard } from "@/lib/work-orders/data";
import { WorkOrdersClient } from "./WorkOrdersClient";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <WorkOrdersClient dashboard={{ buckets: { overdue: [], today: [], upcoming: [], unscheduled: [] }, pendingApproval: [], counts: {} }} isAdmin={false} />;
  const dashboard = await getWorkOrderDashboard(tenantId, new Date());
  return <WorkOrdersClient dashboard={dashboard} isAdmin={user.role === "admin"} />;
}
