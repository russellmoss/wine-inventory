import { notFound } from "next/navigation";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { getWorkOrderDetail } from "@/lib/work-orders/data";
import { WorkOrderDetailClient } from "./WorkOrderDetailClient";
import { PageObjectContext } from "@/components/assistant/AssistantObjectContext";

export const dynamic = "force-dynamic";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return notFound();
  const wo = await getWorkOrderDetail(tenantId, id);
  if (!wo) return notFound();
  // Plan 071: full editing moved to /work-orders/[id]/edit (the builder). The detail page just links to it.
  // PageObjectContext (plan 105 U4 / DM-56) tells the assistant dock which order is on screen, so a
  // user who lands here from "Review & create" can keep talking about it — "change the schedule",
  // "add a topping task" — without naming it again. Renders nothing; the id is re-resolved
  // tenant-scoped server-side before any of it reaches the model.
  return (
    <>
      <PageObjectContext entity="workOrder" id={wo.id} />
      <WorkOrderDetailClient wo={wo} isAdmin={isTenantAdminLike(user)} />
    </>
  );
}
