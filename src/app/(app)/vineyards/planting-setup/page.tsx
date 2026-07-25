import { prisma } from "@/lib/prisma";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { PlantingSetupClient } from "./PlantingSetupClient";

// Vineyard Intelligence P1 — the planting-geometry setup surface: review/migrate existing block
// polygons into planting-area parents, see topology, and inspect the governed layer stack.
export default async function PlantingSetupPage() {
  const user = await requireReadyUser();
  await requireActiveTenant();
  const vineyards = await prisma.vineyard.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return <PlantingSetupClient vineyards={vineyards} memberVineyardIds={user.vineyardIds} />;
}
