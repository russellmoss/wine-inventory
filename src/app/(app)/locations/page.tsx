import { prisma } from "@/lib/prisma";
import { LocationsClient } from "./LocationsClient";

export default async function LocationsPage() {
  const locations = await prisma.location.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isSystem: true, isActive: true },
  });
  return <LocationsClient locations={locations} />;
}
