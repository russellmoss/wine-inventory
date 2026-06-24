import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { MapsClient } from "./MapsClient";

export default async function VineyardMapsPage() {
  const user = await requireReadyUser();
  const vineyards = await prisma.vineyard.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return <MapsClient vineyards={vineyards} assignedVineyardId={user.assignedVineyardId} />;
}
