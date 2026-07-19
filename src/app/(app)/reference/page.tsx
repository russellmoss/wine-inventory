import { prisma } from "@/lib/prisma";
import { requireActiveTenant } from "@/lib/dal";
import { ReferenceClient } from "./ReferenceClient";

export default async function ReferencePage() {
  await requireActiveTenant();
  const [varieties, vineyards] = await Promise.all([
    prisma.variety.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        color: true,
        abbreviation: true,
        // Optional reference detail (ticket #308)
        clone: true,
        rootstock: true,
        nursery: true,
        berryColor: true,
        species: true,
      },
    }),
    prisma.vineyard.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true, abbreviation: true } }),
  ]);
  const varietyOptions = varieties
    .filter((v) => v.isActive)
    .map((v) => ({ id: v.id, name: v.name, color: v.color }));
  return <ReferenceClient varieties={varieties} vineyards={vineyards} varietyOptions={varietyOptions} />;
}
