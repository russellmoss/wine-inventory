import { prisma } from "@/lib/prisma";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { MapsClient } from "./MapsClient";

export default async function VineyardMapsPage() {
  const user = await requireReadyUser();
  await requireActiveTenant();
  const vineyards = await prisma.vineyard.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return <MapsClient vineyards={vineyards} memberVineyardIds={user.vineyardIds} />;
}
