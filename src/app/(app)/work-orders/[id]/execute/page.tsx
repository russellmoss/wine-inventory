import { notFound } from "next/navigation";
import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderDetail, getWorkOrderPickers } from "@/lib/work-orders/data";
import { ExecuteClient } from "./ExecuteClient";

export const dynamic = "force-dynamic";

export default async function ExecuteWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return notFound();
  const [wo, pickers] = await Promise.all([getWorkOrderDetail(tenantId, id), getWorkOrderPickers(tenantId)]);
  if (!wo) return notFound();
  return <ExecuteClient wo={wo} pickers={pickers} />;
}
