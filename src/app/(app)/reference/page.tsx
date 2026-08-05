import { prisma } from "@/lib/prisma";
import { requireActiveTenant, requireReadyUser, isTenantAdminLike, canAccessVineyard } from "@/lib/dal";
import { ReferenceClient } from "./ReferenceClient";

export default async function ReferencePage() {
  await requireActiveTenant();
  const user = await requireReadyUser();
  const isAdmin = isTenantAdminLike(user);
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
  // Computed with the SAME predicate the server actions use, so the buttons and the gate can't drift.
  // An admin lands here as "every id", not as a client-side special case.
  const editableVineyardIds = vineyards.filter((v) => canAccessVineyard(user, v.id)).map((v) => v.id);
  return (
    <ReferenceClient
      varieties={varieties}
      vineyards={vineyards}
      varietyOptions={varietyOptions}
      isAdmin={isAdmin}
      editableVineyardIds={editableVineyardIds}
    />
  );
}
