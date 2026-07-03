import { notFound } from "next/navigation";
import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderPrintView } from "@/lib/work-orders/data";
import { PrintClient } from "./PrintClient";

export const dynamic = "force-dynamic";

export default async function WorkOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) notFound();
  const wo = await getWorkOrderPrintView(tenantId, id);
  if (!wo) notFound();
  return <PrintClient wo={wo} workOrderId={id} printedAt={new Date().toISOString()} />;
}
