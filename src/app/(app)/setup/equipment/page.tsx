import { requireReadyUser } from "@/lib/dal";
import { listEquipment } from "@/lib/equipment/equipment";
import { listLocations } from "@/lib/work-orders/data";
import { EquipmentClient } from "./EquipmentClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipment" };

// Plan 053 B10: the equipment registry (presses, filters, pumps…). Authoring is admin/owner-gated; the
// list is readable by all so the work-order builder can reference equipment as advisory required gear.
export default async function EquipmentPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const [equipment, locations] = await Promise.all([listEquipment(tenantId), listLocations(tenantId)]);
  return <EquipmentClient equipment={equipment} locations={locations} isAdmin={user.role === "admin" || user.role === "owner"} />;
}
