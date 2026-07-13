import { notFound } from "next/navigation";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { getWorkOrderDetail } from "@/lib/work-orders/data";
import { WorkOrderDetailClient } from "./WorkOrderDetailClient";

export const dynamic = "force-dynamic";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return notFound();
  const wo = await getWorkOrderDetail(tenantId, id);
  if (!wo) return notFound();
  return <WorkOrderDetailClient wo={wo} isAdmin={isTenantAdminLike(user)} />;
}
