import { notFound } from "next/navigation";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { getWorkOrderDetail, listOrgMembers } from "@/lib/work-orders/data";
import { WorkOrderDetailClient } from "./WorkOrderDetailClient";

export const dynamic = "force-dynamic";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return notFound();
  const wo = await getWorkOrderDetail(tenantId, id);
  if (!wo) return notFound();
  const isAdmin = isTenantAdminLike(user);
  // Plan 069: admins/developers can set the Lead + reschedule from the detail page — load the member list
  // for the Lead picker only when the viewer can actually edit.
  const members = isAdmin ? await listOrgMembers(tenantId) : [];
  return <WorkOrderDetailClient wo={wo} isAdmin={isAdmin} members={members} />;
}
