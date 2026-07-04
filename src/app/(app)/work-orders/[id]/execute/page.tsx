import { notFound } from "next/navigation";
import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderDetail, getWorkOrderPickers } from "@/lib/work-orders/data";
import { loadCrushFormData } from "@/lib/ferment/crush-data";
import { loadPressFormData } from "@/lib/ferment/press-data";
import { ExecuteClient } from "./ExecuteClient";

export const dynamic = "force-dynamic";

export default async function ExecuteWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return notFound();
  const [wo, pickers] = await Promise.all([getWorkOrderDetail(tenantId, id), getWorkOrderPickers(tenantId)]);
  if (!wo) return notFound();
  // Plan 035: only fetch the (heavier) harvest-pick / pressable-position data when the WO actually has a
  // de-stem/crush or press/saignée task — the crew fills those run-time sub-forms on the execute screen.
  const hasCrush = wo.tasks.some((t) => t.kind === "OPERATION" && t.opType === "CRUSH");
  const hasPress = wo.tasks.some((t) => t.kind === "OPERATION" && t.opType === "PRESS");
  const [crushData, pressData] = await Promise.all([
    hasCrush ? loadCrushFormData() : Promise.resolve(null),
    hasPress ? loadPressFormData() : Promise.resolve(null),
  ]);
  return <ExecuteClient wo={wo} pickers={pickers} crushData={crushData} pressData={pressData} />;
}
