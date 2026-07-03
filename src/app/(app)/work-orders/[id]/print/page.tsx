import { notFound } from "next/navigation";
import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderDetail } from "@/lib/work-orders/data";
import { PrintClient } from "./PrintClient";

export const dynamic = "force-dynamic";

export default async function WorkOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) notFound();
  const wo = await getWorkOrderDetail(tenantId, id);
  if (!wo) notFound();
  // The "printed on" stamp is computed on the server (client Date is fine too, but keep it deterministic).
  return <PrintClient wo={wo} printedAt={new Date().toISOString()} />;
}
